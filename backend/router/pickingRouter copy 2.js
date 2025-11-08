import express from "express";
import db from "../config/db.js";
import { broadcastStockUpdate } from "./realtimeRouter.js";
import {
  validatePickingListItems,
  processPickingListConfirmation,
  processPickingListVoid,
  getLatestStockForBroadcast,
} from "../services/pickingService.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

/**
 * [HYBRID CSV] Menerima data JSON 'Tagihan (CSV)' yang sudah di-parse.
 * Menangani transaksi dan duplikasi invoice.
 */
router.post("/upload-json", canAccess("upload-picking-list"), express.json(), async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { invoices } = req.body;
  if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ success: false, message: "Data invoice tidak valid." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    let createdCount = 0;
    let skippedCount = 0;
    let invalidSkus = [];
    let totalItemsProcessed = 0;

    for (const invoiceData of invoices) {
      try {
        const [listResult] = await connection.query(
          `INSERT INTO picking_lists
             (user_id, source, status, original_invoice_id, customer_name, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [userId, invoiceData.source, "PENDING", invoiceData.invoiceId, invoiceData.customerName]
        );

        const pickingListId = listResult.insertId;
        let itemsToInsert = [];

        for (const item of invoiceData.items) {
          const [productRows] = await connection.query(
            "SELECT id FROM products WHERE sku = ? AND is_active = TRUE",
            [item.sku]
          );

          if (productRows.length > 0) {
            const productId = productRows[0].id;
            itemsToInsert.push([
              pickingListId,
              item.sku,
              item.quantity,
              productId, // Memasukkan ID produk yang valid
            ]);
            totalItemsProcessed++;
          } else {
            invalidSkus.push(item.sku);
          }
        }

        if (itemsToInsert.length > 0) {
          await connection.query(
            `INSERT INTO picking_list_items
               (picking_list_id, original_sku, quantity, product_id)
             VALUES ?`,
            [itemsToInsert]
          );
        }
        createdCount++;
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          skippedCount++;
        } else {
          throw error;
        }
      }
    }

    await connection.commit();

    let message = `Import berhasil. ${createdCount} list baru dibuat, ${skippedCount} list dilewati (duplikat). ${totalItemsProcessed} item valid diproses.`;
    if (invalidSkus.length > 0) {
      message += ` ${invalidSkus.length} item dilewati (SKU tidak ditemukan): ${[
        ...new Set(invalidSkus),
      ]
        .slice(0, 10)
        .join(", ")}`;
      if (invalidSkus.length > 10) message += "...";
    }

    res.status(201).json({
      success: true,
      message: message,
      created: createdCount,
      skipped: skippedCount,
      invalidSkus: [...new Set(invalidSkus)],
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat memproses batch invoice JSON:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Gagal memproses data invoice." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * [HYBRID PDF] Menerima hasil parsing PDF (Tokopedia/Shopee) dari client-side.
 * Memvalidasi, menyimpan, dan mengembalikan hasil untuk ditampilkan di UI.
 */
router.post(
  "/validate-parsed",
  canAccess("upload-picking-list"),
  express.json(),
  async (req, res) => {
    // Ambil 'filename' dari body
    const { source, items, filename } = req.body;
    const userId = req.user.id;

    if (!source || !["Tokopedia", "Shopee"].includes(source)) {
      return res.status(400).json({ success: false, message: "Sumber tidak valid." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Daftar item tidak boleh kosong." });
    }

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Gunakan filename jika ada, jika tidak, gunakan fallback dummy
      const originalFilename = filename || `parsed_${source}_${Date.now()}`;

      const [pickingListResult] = await connection.query(
        "INSERT INTO picking_lists (user_id, source, original_filename, status) VALUES (?, ?, ?, ?)",
        [userId, source, originalFilename, "PENDING_VALIDATION"] // Gunakan nama file
      );
      const pickingListId = pickingListResult.insertId;
      const validationResults = { pickingListId, validItems: [], invalidSkus: [] };

      const [displayLocRows] = await connection.query(
        "SELECT id FROM locations WHERE purpose = ? LIMIT 1",
        ["DISPLAY"]
      );
      if (displayLocRows.length === 0) {
        throw new Error(`Tidak ditemukan lokasi dengan purpose 'DISPLAY'.`);
      }
      const displayLocationId = displayLocRows[0].id;

      for (const item of items) {
        // Query validasi yang mengambil info stok TOTAL display
        const [productRows] = await connection.query(
          `SELECT
            p.id, p.name, p.is_package,
            (
              SELECT COALESCE(SUM(sl.quantity), 0)
              FROM stock_locations sl
              JOIN locations l ON sl.location_id = l.id
              WHERE sl.product_id = p.id AND l.purpose = 'DISPLAY'
            ) as current_stock_display
          FROM products p
          WHERE p.sku = ?`,
          [item.sku]
        );

        if (productRows.length > 0) {
          const product = productRows[0];
          let componentsData = null;

          if (product.is_package) {
            const [components] = await connection.query(
              `SELECT pc.quantity_per_package, p_comp.sku as component_sku, p_comp.name as component_name,
                      COALESCE(sl_comp.quantity, 0) as component_stock_display
               FROM package_components pc
               JOIN products p_comp ON pc.component_product_id = p_comp.id
               LEFT JOIN stock_locations sl_comp ON p_comp.id = sl_comp.product_id AND sl_comp.location_id = ?
               WHERE pc.package_product_id = ?`,
              [displayLocationId, product.id]
            );
            if (components.length > 0) componentsData = components;
          }

          await connection.query(
            "INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity) VALUES (?, ?, ?, ?)",
            [pickingListId, product.id, item.sku, item.qty]
          );

          validationResults.validItems.push({
            sku: item.sku,
            qty: item.qty,
            name: product.name,
            is_package: product.is_package,
            current_stock: product.current_stock_display, // Kirim total stok display
            components: componentsData,
          });
        } else {
          validationResults.invalidSkus.push(item.sku);
        }
      }

      await connection.commit();
      res.status(200).json({ success: true, data: validationResults });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error("Error saat validasi data picking list (parsed):", error);
      res.status(500).json({
        success: false,
        message: error.message || "Gagal validasi data picking list di server.",
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * ✅ MENAMBAHKAN KEMBALI ENDPOINT YANG HILANG
 * Membatalkan picking list yang masih PENDING atau PENDING_VALIDATION.
 */
router.post("/:id/cancel", canAccess("upload-picking-list"), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [listRows] = await connection.query(
      "SELECT status FROM picking_lists WHERE id = ? FOR UPDATE",
      [id]
    );
    if (listRows.length === 0) {
      throw new Error(`Picking list ID ${id} tidak ditemukan.`);
    }

    const currentStatus = listRows[0].status;
    // Hanya izinkan pembatalan jika statusnya PENDING (dari CSV) atau PENDING_VALIDATION (dari PDF)
    if (currentStatus !== "PENDING" && currentStatus !== "PENDING_VALIDATION") {
      throw new Error(
        `Hanya list dengan status 'PENDING' atau 'PENDING_VALIDATION' yang bisa dibatalkan.`
      );
    }

    // (Opsional) Tambahkan audit log jika perlu
    await connection.query(
      `INSERT INTO audit_logs (user_id, action_type, target_table, target_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        "CANCEL_PICKING_LIST",
        "picking_lists",
        id,
        `Membatalkan picking list #${id} (status: ${currentStatus})`,
      ]
    );

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);
    await connection.commit();

    res.status(200).json({
      success: true,
      message: `Picking list #${id} berhasil dibatalkan.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`Error saat membatalkan picking list pending #${id}:`, error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan picking list." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * Konfirmasi picking list dan kurangi stok dari lokasi 'DISPLAY'.
 */
router.post("/:id/confirm", canAccess("confirm-picking-list"), async (req, res) => {
  const { id } = req.params;
  const items = req.body.items;
  const userId = req.user.id;
  const SOURCE_LOCATION_PURPOSE = "DISPLAY";

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Tidak ada item untuk diproses." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [sourceLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ?`,
      [SOURCE_LOCATION_PURPOSE]
    );
    if (sourceLocationRows.length === 0) {
      throw new Error(`Lokasi sumber '${SOURCE_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const primaryDisplayLocationId = sourceLocationRows[0].id;
    const allDisplayLocationIds = sourceLocationRows.map((loc) => loc.id);

    await validatePickingListItems(connection, items, primaryDisplayLocationId);

    // Asumsi service Anda (processPickingListConfirmation)
    // menangani logika penarikan dari lokasi display utama
    const affectedProductIds = await processPickingListConfirmation(
      connection,
      items,
      primaryDisplayLocationId,
      userId,
      id
    );

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["COMPLETED", id]);
    await connection.commit();

    const affectedProductIdsArray = [...affectedProductIds];
    if (affectedProductIdsArray.length > 0) {
      for (const locId of allDisplayLocationIds) {
        const finalUpdates = await getLatestStockForBroadcast(affectedProductIdsArray, locId);
        if (finalUpdates.length > 0) {
          broadcastStockUpdate(finalUpdates);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `Berhasil memproses ${items.length} item. Stok telah diperbarui.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat konfirmasi picking list:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal mengonfirmasi picking list." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * Membatalkan (void) picking list yang sudah 'COMPLETED' dan kembalikan stok.
 */
router.post("/:id/void", canAccess("void-picking-list"), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const TARGET_LOCATION_PURPOSE = "DISPLAY";

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [listRows] = await connection.query(
      "SELECT status FROM picking_lists WHERE id = ? FOR UPDATE",
      [id]
    );
    if (listRows.length === 0) throw new Error(`Picking list ID ${id} tidak ditemukan.`);
    if (listRows[0].status !== "COMPLETED")
      throw new Error("Hanya picking list 'COMPLETED' yang bisa di-void.");

    const [targetLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ?`,
      [TARGET_LOCATION_PURPOSE]
    );
    if (targetLocationRows.length === 0) {
      throw new Error(`Lokasi target '${TARGET_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const allDisplayLocationIds = targetLocationRows.map((loc) => loc.id);
    const primaryDisplayLocationId = targetLocationRows[0].id;

    // Asumsi service void mengembalikan ke lokasi display pertama
    const affectedProductIdsVoid = await processPickingListVoid(
      connection,
      id,
      primaryDisplayLocationId,
      userId
    );
    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);
    await connection.commit();

    const affectedProductIdsVoidArray = [...affectedProductIdsVoid];
    if (affectedProductIdsVoidArray.length > 0) {
      for (const locId of allDisplayLocationIds) {
        const finalUpdatesVoid = await getLatestStockForBroadcast(
          affectedProductIdsVoidArray,
          locId
        );
        if (finalUpdatesVoid.length > 0) {
          broadcastStockUpdate(finalUpdatesVoid);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Transaksi picking list berhasil di-void dan stok telah dikembalikan.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat void picking list:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan transaksi." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * Mengambil riwayat picking list.
 */
router.get("/history", async (req, res) => {
  try {
    const query = `
        SELECT pl.id, pl.source, pl.status, pl.original_invoice_id, pl.customer_name, pl.created_at, u.username, pl.original_filename
        FROM picking_lists pl
        JOIN users u ON pl.user_id = u.id
        ORDER BY pl.created_at DESC
        LIMIT 100;
      `;
    const [history] = await db.query(query);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error saat mengambil riwayat picking list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat." });
  }
});

/**
 * Mengambil detail item dari sebuah picking list.
 * (Sudah di-refactor dengan benar)
 */
router.get("/:id/details", async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await db.getConnection();

    const [displayLocRows] = await connection.query(
      "SELECT id FROM locations WHERE purpose = ? LIMIT 1",
      ["DISPLAY"]
    );
    if (displayLocRows.length === 0) {
      throw new Error(`Tidak ditemukan lokasi dengan purpose 'DISPLAY'.`);
    }
    const displayLocationId = displayLocRows[0].id;

    const query = `
        SELECT
          pli.original_sku as sku,
          p.name,
          pli.quantity as qty,
          p.id as product_id,
          p.is_package,
          (
            SELECT COALESCE(SUM(sl.quantity), 0)
            FROM stock_locations sl
            JOIN locations l ON sl.location_id = l.id
            WHERE sl.product_id = p.id
              AND l.purpose = 'DISPLAY'
          ) as current_stock_display
        FROM picking_list_items pli
        LEFT JOIN products p ON pli.original_sku = p.sku
        WHERE pli.picking_list_id = ?
      `;
    const [items] = await connection.query(query, [id]);

    if (items.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const detailedItems = [];
    for (const item of items) {
      let componentsData = null;
      if (item.is_package && item.product_id) {
        const [components] = await connection.query(
          `SELECT pc.quantity_per_package, p_comp.sku as component_sku, p_comp.name as component_name,
                  COALESCE(sl_comp.quantity, 0) as component_stock_display
           FROM package_components pc
           JOIN products p_comp ON pc.component_product_id = p_comp.id
           LEFT JOIN stock_locations sl_comp ON p_comp.id = sl_comp.product_id AND sl_comp.location_id = ?
           WHERE pc.package_product_id = ?`,
          [displayLocationId, item.product_id]
        );
        if (components.length > 0) componentsData = components;
      }

      detailedItems.push({
        sku: item.sku,
        name: item.name,
        qty: item.qty,
        is_package: item.is_package,
        current_stock_display: item.current_stock_display,
        components: componentsData,
      });
    }

    res.json({ success: true, data: detailedItems });
  } catch (error) {
    console.error(`Error saat mengambil detail picking list #${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail item." });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
