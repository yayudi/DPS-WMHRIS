// backend\router\pickingRouter.js
import express from "express";
import db from "../config/db.js";
import multer from "multer";
import fs from "fs";
import { parsePdf } from "../services/pdf.js";
import { broadcastStockUpdate } from "./realtimeRouter.js";
import {
  validatePickingListItems,
  processPickingListConfirmation,
  processPickingListVoid,
  getLatestStockForBroadcast,
} from "../services/pickingService.js";

const router = express.Router();
const upload = multer({ dest: "tmp/" });

function parseTokopediaPdfText(textContent) {
  if (!textContent) return [];
  console.log(
    "\n--- DEBUG: Teks Mentah dari PDF ---\n",
    textContent,
    "\n---------------------------------\n"
  );
  const items = [];
  const productRegex = /(PP\d+)\s+(\d+)/g;
  let match;
  while ((match = productRegex.exec(textContent)) !== null) {
    const sku = match[1]?.trim();
    const qty = parseInt(match[2]?.trim(), 10);
    if (sku && !isNaN(qty)) {
      items.push({ sku, qty });
    }
  }
  console.log("[Tokopedia Parser] Ditemukan item:", items);
  return items;
}
function parseShopeePdfText(textContent) {
  if (!textContent) return [];
  console.log("[Parser] Menggunakan engine parsing Shopee...");
  const cleanedText = textContent.replace(/(PP\d+)\s*\r?\n\s*(\d+)/g, "$1$2");
  console.log(
    "\n--- DEBUG: Teks Shopee Setelah Dibersihkan ---\n",
    cleanedText,
    "\n---------------------------------\n"
  );
  const items = [];
  const productRegex = /(PP\d{7})[\s\S]*?\s(\d+)\s+[A-Z0-9]{14,}/g;
  let match;
  while ((match = productRegex.exec(cleanedText)) !== null) {
    const sku = match[1]?.trim();
    const qty = parseInt(match[2]?.trim(), 10);
    if (sku && !isNaN(qty)) {
      const existingItem = items.find((item) => item.sku === sku);
      if (existingItem) {
        existingItem.qty += qty;
      } else {
        items.push({ sku, qty });
      }
    }
  }
  console.log(`[Parser] Ditemukan ${items.length} item unik.`);
  return items;
}
function parseOfflinePdfText(textContent) {
  if (!textContent) return [];
  console.log("[Parser] Menggunakan engine parsing Offline/Surat Jalan...");
  const items = [];
  const productRegex = /^\s*\d+\s+(PP\d{7})[\s\S]*?(\d+)\s*$/gm;
  let match;
  while ((match = productRegex.exec(textContent)) !== null) {
    const sku = match[1]?.trim();
    const qty = parseInt(match[2]?.trim(), 10);
    if (sku && !isNaN(qty)) {
      items.push({ sku, qty });
    }
  }
  console.log(`[Parser] Ditemukan ${items.length} item.`);
  return items;
}

/**
 * POST /api/picking/upload
 * (Handler upload tetap sama, tidak perlu diubah karena sudah direfaktor)
 */
router.post("/upload", upload.single("pickingListFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Tidak ada file yang di-upload." });
  }
  const { source } = req.body;
  if (!["Tokopedia", "Shopee", "Offline"].includes(source)) {
    return res.status(400).json({ success: false, message: "Sumber tidak valid." });
  }
  let connection;
  try {
    let textContent;
    if (req.file.mimetype === "application/pdf") {
      textContent = await parsePdf(req.file.path);
    } else {
      textContent = fs.readFileSync(req.file.path, "utf-8");
    }
    let parsedItems;
    // ... (Logika parsing tetap sama) ...
    if (source === "Tokopedia") {
      parsedItems = parseTokopediaPdfText(textContent);
    } else if (source === "Shopee") {
      parsedItems = parseShopeePdfText(textContent);
    } else if (source === "Offline") {
      parsedItems = parseOfflinePdfText(textContent);
    } else {
      throw new Error(`Parser untuk sumber '${source}' belum diimplementasikan.`);
    }
    if (parsedItems.length === 0) {
      throw new Error("Tidak ada item valid yang bisa diparsing dari file. Cek format file.");
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [pickingListResult] = await connection.query(
      "INSERT INTO picking_lists (user_id, source, original_filename, status) VALUES (?, ?, ?, ?)",
      [req.user.id, source, req.file.originalname, "PENDING_VALIDATION"]
    );
    const pickingListId = pickingListResult.insertId;
    const validationResults = { pickingListId, validItems: [], invalidSkus: [] };

    // Cari ID Lokasi Display berdasarkan Purpose
    const DISPLAY_LOCATION_PURPOSE = "DISPLAY";
    const [displayLocRows] = await connection.query(
      "SELECT id FROM locations WHERE purpose = ? LIMIT 1",
      [DISPLAY_LOCATION_PURPOSE]
    );
    if (displayLocRows.length === 0) {
      throw new Error(`Tidak ditemukan lokasi dengan purpose '${DISPLAY_LOCATION_PURPOSE}'.`);
    }
    const displayLocationId = displayLocRows[0].id;

    for (const item of parsedItems) {
      // Ambil info produk DAN stok KHUSUS di lokasi Display
      const [productRows] = await connection.query(
        `
          SELECT
            p.id, p.name, p.is_package,
            COALESCE(sl_display.quantity, 0) as current_stock_display
          FROM products p
          LEFT JOIN stock_locations sl_display ON p.id = sl_display.product_id AND sl_display.location_id = ?
          WHERE p.sku = ?
        `,
        [displayLocationId, item.sku]
      );
      if (productRows.length > 0) {
        const product = productRows[0];
        let componentsData = null;

        if (product.is_package) {
          console.log(`[Upload] Produk ${item.sku} adalah paket, mengambil komponen...`);
          const [components] = await connection.query(
            `SELECT
                pc.quantity_per_package,
                p_comp.sku as component_sku,
                p_comp.name as component_name,
                COALESCE(sl_comp_display.quantity, 0) as component_stock_display -- Stok komponen di display
              FROM package_components pc
              JOIN products p_comp ON pc.component_product_id = p_comp.id
              LEFT JOIN stock_locations sl_comp_display ON p_comp.id = sl_comp_display.product_id AND sl_comp_display.location_id = ? -- Join stok komponen
              WHERE pc.package_product_id = ?`,
            [displayLocationId, product.id]
          );
          if (components.length > 0) {
            componentsData = components;
            console.log(`[Upload]   -> Ditemukan ${components.length} komponen.`);
          } else {
            console.warn(
              `[Upload]   -> PERINGATAN: Paket ${item.sku} tidak memiliki komponen terdefinisi!`
            );
            // Anda mungkin ingin menandai ini di validItems atau invalidSkus
          }
        }
        // --- AKHIR TAMBAHAN ---

        await connection.query(
          "INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity) VALUES (?, ?, ?, ?)",
          [pickingListId, product.id, item.sku, item.qty]
        );

        // Kirim data yang relevan ke frontend
        validationResults.validItems.push({
          sku: item.sku, // original_sku dari CSV/PDF
          qty: item.qty, // quantity dari CSV/PDF
          name: product.name,
          is_package: product.is_package,
          current_stock: product.current_stock_display, // Stok display (paket = 0, single = aktual)
          components: componentsData, // Kirim null atau array komponen
        });
      } else {
        validationResults.invalidSkus.push(item.sku);
      }
    }
    await connection.commit();
    res.status(200).json({ success: true, data: validationResults });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat memproses picking list:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Gagal menghapus file temporary:", err);
      });
    }
  }
});

/**
 * POST /api/picking/:id/confirm
 * *** REFAKTOR: Menggunakan pickingService ***
 */
router.post("/:id/confirm", async (req, res) => {
  console.log("\n--- [Router] Proses Konfirmasi Picking List Dimulai ---");
  const { id } = req.params;
  const items = req.body.items;
  const userId = req.user.id;
  const SOURCE_LOCATION_PURPOSE = "DISPLAY";

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Tidak ada item yang dipilih untuk diproses." });
  }

  let connection;
  let affectedProductIds = new Set(); // Definisikan di scope luar try

  try {
    connection = await db.getConnection();
    console.log("✅ [Router] Koneksi DB berhasil, memulai transaksi...");
    await connection.beginTransaction();

    // 1. Dapatkan ID Lokasi Sumber
    const [sourceLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ? LIMIT 1`,
      [SOURCE_LOCATION_PURPOSE]
    );
    if (sourceLocationRows.length === 0) {
      throw new Error(`Lokasi sumber dengan purpose '${SOURCE_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const fromLocationId = sourceLocationRows[0].id;
    console.log(
      `✅ [Router] Lokasi Sumber (Purpose: ${SOURCE_LOCATION_PURPOSE}) ID: ${fromLocationId}`
    );

    // 2. Panggil Service Validasi
    await validatePickingListItems(connection, items, fromLocationId);

    // 3. Panggil Service Proses Pengurangan Stok
    affectedProductIds = await processPickingListConfirmation(
      connection,
      items,
      fromLocationId,
      userId,
      id
    );

    // 4. Update status picking list
    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["COMPLETED", id]);

    // 5. Commit transaksi
    await connection.commit();
    console.log("✅ [Router] Transaksi berhasil di-commit.");

    // 6. Siarkan pembaruan stok (dilakukan di luar transaksi)
    // Pastikan affectedProductIds adalah array sebelum dikirim ke helper
    const affectedProductIdsArray = [...affectedProductIds];
    if (affectedProductIdsArray.length > 0) {
      console.log("📢 [Router] Menyiapkan broadcast untuk IDs:", affectedProductIdsArray);
      // Gunakan helper baru untuk mendapatkan data broadcast
      const finalUpdates = await getLatestStockForBroadcast(
        affectedProductIdsArray,
        fromLocationId
      );
      if (finalUpdates.length > 0) {
        broadcastStockUpdate(finalUpdates);
        console.log("📢 [Router] Broadcast pembaruan stok terkirim.");
      }
    }

    res.status(200).json({
      success: true,
      message: `Berhasil memproses ${items.length} item. Stok telah diperbarui.`,
    });
  } catch (error) {
    if (connection) {
      console.log("Rolling back transaction...");
      await connection.rollback();
    }
    console.error("❌ [Router] Error saat konfirmasi picking list:", error.message);
    // Kirim error spesifik ke frontend
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal mengonfirmasi picking list." });
  } finally {
    if (connection) connection.release();
    console.log("--- [Router] Proses Konfirmasi Picking List Selesai ---");
  }
});

/**
 * POST /api/picking/:id/cancel
 * Membatalkan picking list yang masih PENDING_VALIDATION.
 */
router.post("/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Untuk logging jika perlu

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
    // Hanya PENDING_VALIDATION yang bisa di-cancel di sini
    if (listRows[0].status !== "PENDING_VALIDATION") {
      throw new Error(
        `Hanya picking list dengan status 'PENDING_VALIDATION' yang bisa dibatalkan.`
      );
    }

    await connection.query(
      `INSERT INTO audit_logs (user_id, action_type, target_table, target_id, details)
      VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        "CANCEL_PICKING_LIST",
        "picking_lists",
        id,
        `Membatalkan picking list #${id} (status: PENDING_VALIDATION)`,
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
    console.error(`❌ [Router] Error saat membatalkan picking list pending #${id}:`, error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan picking list." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/picking/history
 * (Tidak berubah)
 */
router.get("/history", async (req, res) => {
  try {
    const query = `
      SELECT pl.id, pl.source, pl.status, pl.original_filename, pl.created_at, u.username
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
 * GET /api/picking/:id/details
 * (Tidak berubah)
 */
router.get("/:id/details", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT pli.original_sku as sku, p.name, pli.quantity as qty
      FROM picking_list_items pli
      JOIN products p ON pli.product_id = p.id
      WHERE pli.picking_list_id = ?
    `;
    const [items] = await db.query(query, [id]);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error(`Error saat mengambil detail picking list #${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail item." });
  }
});

/**
 * POST /api/picking/:id/void
 * *** REFAKTOR: Menggunakan pickingService ***
 */
router.post("/:id/void", async (req, res) => {
  console.log("\n--- [Router] Proses Void Picking List Dimulai ---");
  const { id } = req.params;
  const userId = req.user.id;
  const TARGET_LOCATION_PURPOSE = "DISPLAY";

  let connection;
  let affectedProductIdsVoid = new Set(); // Definisikan di scope luar try

  try {
    connection = await db.getConnection();
    console.log("✅ [Router] Koneksi DB berhasil, memulai transaksi...");
    await connection.beginTransaction();

    // 1. Kunci dan periksa status picking list
    const [listRows] = await connection.query(
      "SELECT status FROM picking_lists WHERE id = ? FOR UPDATE",
      [id]
    );
    if (listRows.length === 0) {
      throw new Error(`Picking list ID ${id} tidak ditemukan.`);
    }
    if (listRows[0].status !== "COMPLETED") {
      throw new Error("Hanya picking list yang sudah 'COMPLETED' yang bisa dibatalkan.");
    }

    // 2. Dapatkan ID Lokasi Tujuan (Display)
    const [targetLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ? LIMIT 1`,
      [TARGET_LOCATION_PURPOSE]
    );
    if (targetLocationRows.length === 0) {
      throw new Error(`Lokasi target dengan purpose '${TARGET_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const locationId = targetLocationRows[0].id;
    console.log(
      `✅ [Router] Lokasi Target (Purpose: ${TARGET_LOCATION_PURPOSE}) ID: ${locationId}`
    );

    // 3. Panggil Service Proses Pengembalian Stok
    affectedProductIdsVoid = await processPickingListVoid(connection, id, locationId, userId);

    // 4. Update status picking list
    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);

    // 5. Commit transaksi
    await connection.commit();
    console.log("✅ [Router] Transaksi void berhasil di-commit.");

    // 6. Siarkan pembaruan stok (dilakukan di luar transaksi)
    // Pastikan affectedProductIdsVoid adalah array sebelum dikirim ke helper
    const affectedProductIdsVoidArray = [...affectedProductIdsVoid];
    if (affectedProductIdsVoidArray.length > 0) {
      console.log(
        "📢 [Router] Menyiapkan broadcast (VOID) untuk IDs:",
        affectedProductIdsVoidArray
      );
      // Gunakan helper baru untuk mendapatkan data broadcast
      const finalUpdatesVoid = await getLatestStockForBroadcast(
        affectedProductIdsVoidArray,
        locationId
      );
      if (finalUpdatesVoid.length > 0) {
        broadcastStockUpdate(finalUpdatesVoid);
        console.log("📢 [Router] Broadcast pembaruan stok (VOID) terkirim.");
      }
    }

    res.status(200).json({
      success: true,
      message: "Transaksi picking list berhasil dibatalkan dan stok telah dikembalikan.",
    });
  } catch (error) {
    if (connection) {
      console.log("Rolling back transaction (void)...");
      await connection.rollback();
    }
    console.error("❌ [Router] Error saat membatalkan picking list:", error.message);
    // Kirim error spesifik ke frontend
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan transaksi." });
  } finally {
    if (connection) connection.release();
    console.log("--- [Router] Proses Void Picking List Selesai ---");
  }
});

export default router;
