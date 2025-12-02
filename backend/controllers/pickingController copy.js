// backend\controllers\pickingController.js
import db from "../config/db.js";
import { broadcastStockUpdate } from "../router/realtimeRouter.js";
import {
  processPickingListConfirmation,
  processPickingListVoid,
  getLatestStockForBroadcast,
} from "../services/pickingService.js";
// Impor service baru kita
import {
  performPickingValidation,
  fetchPickingListDetails,
} from "../services/pickingDataService.js";

// =================================================================================
// CONTROLLERS (YANG SUDAH DI-REFACTOR)
// =================================================================================

/**
 * [HYBRID CSV] Menerima data JSON 'Tagihan (CSV)' yang sudah di-parse.
 */
export const uploadJsonInvoices = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { invoices, filename } = req.body;
  if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ success: false, message: "Data invoice tidak valid." });
  }

  try {
    // Agregasi Item
    const aggregatedItemsMap = new Map();
    let source = "CSV_BATCH";

    const primaryInvoiceId = invoices[0]?.invoiceNo || null;
    const primaryCustomerName = invoices[0]?.customerName || null;

    if (invoices.length > 0 && invoices[0].source) {
      source = invoices[0].source;
    }
    for (const invoiceData of invoices) {
      const invoiceNo = invoiceData.invoiceNo;
      const customerName = invoiceData.customerName;
      for (const item of invoiceData.items) {
        const sku = item.sku;
        const qty = Number(item.quantity);
        if (isNaN(qty) || qty <= 0) continue;
        // const existingQty = aggregatedItemsMap.get(item.sku) || 0;
        // aggregatedItemsMap.set(item.sku, existingQty + qty);

        const existing = aggregatedItemsMap.get(sku) || {
          qty: 0,
          invoiceNos: [],
          customerNames: [],
        };
        const newQty = existing.qty + qty;
        const newInvoiceNos = existing.invoiceNos;
        const newCustomerNames = existing.customerNames;

        // Tambahkan invoiceNo *jika* ada DAN belum ada
        if (invoiceNo && !newInvoiceNos.includes(invoiceNo)) {
          newInvoiceNos.push(invoiceNo);
        }

        if (customerName && !newCustomerNames.includes(customerName)) {
          newCustomerNames.push(customerName);
        }

        aggregatedItemsMap.set(sku, {
          qty: newQty,
          invoiceNos: newInvoiceNos,
          customerNames: newCustomerNames,
        });
      }
    }

    // const items = Array.from(aggregatedItemsMap, ([sku, qty]) => ({ sku, qty }));
    const items = Array.from(aggregatedItemsMap, ([sku, data]) => ({
      sku,
      qty: data.qty,
      invoiceNos: data.invoiceNos,
      customerNames: data.customerNames,
    }));
    if (items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Tidak ada item valid untuk diproses." });
    }

    // Panggil Service Validasi
    const originalFilename =
      filename || `Batch ${source} - ${new Date().toLocaleDateString("id-ID")}`;

    const validationResults = await performPickingValidation({
      items,
      userId,
      source,
      originalFilename,
      originalInvoiceId: primaryInvoiceId,
      customerName: primaryCustomerName,
    });

    // Kirim Respons
    res.status(200).json({ success: true, data: validationResults });
  } catch (error) {
    console.error("Error di uploadJsonInvoices:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Gagal memproses data invoice.",
    });
  }
};

/**
 * [HYBRID PDF] Menerima hasil parsing PDF (Tokopedia/Shopee) dari client-side.
 */
export const validateParsedData = async (req, res) => {
  const { source, items, filename } = req.body;
  const userId = req.user.id;

  if (!source || !["Tokopedia", "Shopee"].includes(source)) {
    return res.status(400).json({ success: false, message: "Sumber tidak valid." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "Daftar item tidak boleh kosong." });
  }

  try {
    const originalFilename = filename || `parsed_${source}_${Date.now()}`;

    // Panggil Service Validasi
    const validationResults = await performPickingValidation({
      items,
      userId,
      source,
      originalFilename,
      originalInvoiceId: null,
      customerName: null,
    });

    res.status(200).json({ success: true, data: validationResults });
  } catch (error) {
    console.error("Error di validateParsedData:", error.message);
    res.status(500).json({
      success: false,
      message: error.message || "Gagal validasi data picking list di server.",
    });
  }
};

/**
 * Mengambil detail item dari sebuah picking list.
 */
export const getPickingListDetails = async (req, res) => {
  const { id } = req.params;
  try {
    // Panggil Service Data
    const detailedItems = await fetchPickingListDetails(id);
    console.log(`Detail picking list #${id} diambil: ${detailedItems.length} item.`);
    res.json({ success: true, data: detailedItems });
  } catch (error) {
    console.error(`Error saat mengambil detail picking list #${id}:`, error.message);
    res.status(500).json({ success: false, message: "Gagal mengambil detail item." });
  }
};

// =================================================================================
// CONTROLLER LAINNYA (Hanya memanggil Service)
// =================================================================================

/**
 * Konfirmasi picking list dan kurangi stok dari lokasi 'DISPLAY'.
 */
export const confirmPickingList = async (req, res) => {
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

    // (Satu-satunya kueri yang tersisa di controller adalah untuk broadcast)
    const [sourceLocationRows] = await connection.query(
      `SELECT id FROM locations WHERE purpose = ?`,
      [SOURCE_LOCATION_PURPOSE]
    );
    if (sourceLocationRows.length === 0) {
      throw new Error(`Lokasi sumber '${SOURCE_LOCATION_PURPOSE}' tidak ditemukan.`);
    }
    const allDisplayLocationIds = sourceLocationRows.map((loc) => loc.id);

    // Panggil Service Konfirmasi
    const affectedProductIds = await processPickingListConfirmation(connection, items, userId, id);

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["COMPLETED", id]);
    await connection.commit();

    // Broadcast (Logika ini tetap di controller)
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
};

/**
 * Membatalkan (void) picking list yang sudah 'COMPLETED' dan kembalikan stok.
 */
export const voidPickingList = async (req, res) => {
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

    // Panggil Service Void
    const affectedProductIdsVoid = await processPickingListVoid(connection, id, userId);

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);
    await connection.commit();

    // Broadcast
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
};

/**
 * Menambahkan kembali endpoint 'cancel' yang hilang
 */
export const cancelPendingPickingList = async (req, res) => {
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
    if (currentStatus !== "PENDING" && currentStatus !== "PENDING_VALIDATION") {
      throw new Error(
        `Hanya list dengan status 'PENDING' atau 'PENDING_VALIDATION' yang bisa dibatalkan.`
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
};

/**
 * Mengambil riwayat picking list.
 */
export const getPickingHistory = async (req, res) => {
  try {
    const query = `
        SELECT pl.id, pl.source, pl.status, pl.created_at, u.username, pl.original_filename
        FROM picking_lists pl
        JOIN users u ON pl.user_id = u.id
        ORDER BY pl.created_at DESC
        LIMIT 100;
      `;
    const [history] = await db.query(query.trim()); // [PERBAIKAN] Memanggil .trim()
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error saat mengambil riwayat picking list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat." });
  }
};
