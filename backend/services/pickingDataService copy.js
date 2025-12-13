// backend/services/pickingDataService.js
import db from "../config/db.js";
import { WMS_STATUS } from "../config/wmsConstants.js";
import { processImportData } from "./pickingImportService.js";

// Logger wrapper agar mudah diganti di masa depan (misal ke Winston/Pino)
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
  debug: (msg) => console.log(`[DEBUG] ${msg}`), // Bisa dimatikan di production
};

// ==============================================================================
// READ OPERATIONS (UI Frontend)
// ==============================================================================

/**
 * Mengambil daftar item yang harus dipicking (Status PENDING/VALIDATED)
 */
export const getPendingPickingItemsService = async () => {
  const query = `
    SELECT
      pli.id, pli.picking_list_id, pli.product_id, pli.original_sku as sku, pli.quantity, pli.status,
      COALESCE(loc_picked.code, loc_suggested.code) as location_code,
      p.name as product_name,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at, pl.customer_name,
      pl.marketplace_status,
      -- Subquery Stok Tersedia
      (SELECT sl.quantity FROM stock_locations sl
       WHERE sl.location_id = pli.suggested_location_id AND sl.product_id = pli.product_id
       LIMIT 1) as available_stock
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status NOT IN (?)
    ORDER BY pl.created_at DESC, location_code ASC
  `;

  const [rows] = await db.query(query, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.CANCEL,
  ]);
  return rows;
};

/**
 * Mengambil riwayat picking list (Arsip)
 */
export const getHistoryPickingItemsService = async (limit = 1000) => {
  const query = `
    SELECT
      pl.id as picking_list_id, pl.original_invoice_id, pl.source, pl.status,
      pl.marketplace_status, pl.customer_name, pl.created_at, pl.order_date,
      pli.id as item_id, pli.original_sku as sku, pli.quantity, pli.status as item_status,
      p.name as product_name
    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    LEFT JOIN products p ON pli.product_id = p.id
    WHERE pl.status NOT IN (?, ?)
    ORDER BY pl.created_at DESC, pl.id DESC
    LIMIT ?
  `;

  const [rows] = await db.query(query, [WMS_STATUS.PENDING, WMS_STATUS.VALIDATED, limit]);
  return rows;
};

/**
 * Mengambil detail satu picking list
 */
export const fetchPickingListDetails = async (pickingListId) => {
  const query = `
    SELECT pli.original_sku as sku, pli.quantity as qty, p.name, pli.status
    FROM picking_list_items pli
    JOIN products p ON pli.product_id = p.id
    WHERE pli.picking_list_id = ?
  `;
  const [items] = await db.query(query, [pickingListId]);
  return items;
};

// ==============================================================================
// WRITE OPERATIONS (Aksi User Gudang)
// ==============================================================================

/**
 * Membatalkan Picking List (Soft Delete & Update Status)
 */
export const cancelPickingListService = async (pickingListId, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Update Header
    const [res] = await connection.query(
      `UPDATE picking_lists
       SET status = ?, is_active = NULL, updated_at = NOW()
       WHERE id = ?`,
      [WMS_STATUS.CANCEL, pickingListId]
    );

    if (res.affectedRows === 0) {
      throw new Error("Picking List tidak ditemukan atau sudah diproses.");
    }

    // Update Items
    await connection.query(`UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`, [
      WMS_STATUS.CANCEL,
      pickingListId,
    ]);

    await connection.commit();
    return { success: true, message: "Picking List dibatalkan." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Menyelesaikan Item Picking (Checklist barang + Potong Stok)
 * Optimized: Mengurangi query SELECT dalam loop.
 */
export const completePickingItemsService = async (payloadItems, userId) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    if (!payloadItems?.length) throw new Error("Tidak ada item dipilih.");

    // Extract ID dari payload untuk Bulk Fetch
    const itemIds = payloadItems.map((i) => i.id);

    // Fetch Data Picking Item & Lokasi sekaligus (Mencegah N+1 Query)
    const [dbItems] = await connection.query(
      `SELECT id, picking_list_id, suggested_location_id, product_id, quantity
       FROM picking_list_items
       WHERE id IN (?)`,
      [itemIds]
    );

    if (dbItems.length === 0) throw new Error("Data item tidak ditemukan di database.");

    // Map untuk akses cepat
    const dbItemsMap = new Map(dbItems.map((item) => [item.id, item]));
    const affectedListIds = new Set();

    logger.debug(`Memproses ${dbItems.length} item...`);

    for (const payloadItem of payloadItems) {
      const itemData = dbItemsMap.get(payloadItem.id);

      if (!itemData) continue;

      const { suggested_location_id: locId, product_id: prodId, quantity: qty } = itemData;

      if (!locId) {
        logger.error(`Item ID ${itemData.id} tidak memiliki lokasi (suggested_location_id). Skip.`);
        continue;
      }

      // Update Status Item
      await connection.query(
        `UPDATE picking_list_items
         SET status = 'VALIDATED', picked_from_location_id = ?, confirmed_location_id = ?
         WHERE id = ?`,
        [locId, locId, itemData.id]
      );

      // Update Stok Fisik (Atomic decrement)
      await connection.query(
        `UPDATE stock_locations
         SET quantity = quantity - ?
         WHERE product_id = ? AND location_id = ?`,
        [qty, prodId, locId]
      );

      // Insert Movement Log
      await connection.query(
        `INSERT INTO stock_movements
         (product_id, quantity, from_location_id, movement_type, user_id, notes, created_at)
         VALUES (?, ?, ?, 'SALE', ?, ?, NOW())`,
        [prodId, qty, locId, userId, `Sale Ref: Item #${itemData.id}`]
      );

      affectedListIds.add(itemData.picking_list_id);
    }

    // Cek & Update Status Header Picking List
    // Hanya cek list yang itemnya baru saja berubah
    for (const listId of affectedListIds) {
      const [remaining] = await connection.query(
        `SELECT COUNT(*) as count FROM picking_list_items
         WHERE picking_list_id = ? AND status NOT IN ('VALIDATED', 'CANCEL')`,
        [listId]
      );

      if (remaining[0].count === 0) {
        await connection.query(
          `UPDATE picking_lists SET status = 'VALIDATED', updated_at = NOW() WHERE id = ?`,
          [listId]
        );
      }
    }

    await connection.commit();
    return {
      success: true,
      message: `${dbItems.length} item berhasil dipicking & stok dikurangi.`,
    };
  } catch (error) {
    await connection.rollback();
    logger.error("Rollback Transaction", error);
    throw error;
  } finally {
    connection.release();
  }
};

// ==============================================================================
// IMPORT ORCHESTRATOR
// ==============================================================================

/**
 * Menerima data hasil parsing Excel, lalu memanggil Import Service
 */
export const performPickingValidation = async (payload) => {
  const { items, userId, source } = payload;

  logger.info(`[ORCHESTRATOR] Menerima ${items.length} baris data dari ${source}.`);

  // Grouping Data per Invoice menggunakan Map
  const groupedOrders = new Map();

  items.forEach((item) => {
    if (!item.invoiceId) return;

    if (!groupedOrders.has(item.invoiceId)) {
      groupedOrders.set(item.invoiceId, {
        invoiceId: item.invoiceId,
        customer: item.customer,
        orderDate: item.orderDate,
        status: item.status,
        source: source,
        items: [],
      });
    }

    groupedOrders.get(item.invoiceId).items.push({
      sku: item.sku,
      qty: item.qty,
    });
  });

  const newInvoiceIds = Array.from(groupedOrders.keys());

  if (newInvoiceIds.length > 0) {
    try {
      const [updateResult] = await db.query(
        `UPDATE picking_lists
         SET status = 'OBSOLETE', updated_at = NOW()
         WHERE original_invoice_id IN (?)
           AND status = 'PENDING'`, // Hanya timpa yang statusnya masih PENDING
        [newInvoiceIds]
      );

      if (updateResult.affectedRows > 0) {
        logger.info(`[OBSOLETE] ${updateResult.affectedRows} picking list lama ditandai OBSOLETE.`);
      }
    } catch (error) {
      logger.error("[OBSOLETE] Gagal update status obsolete", error);
      // Opsional: throw error jika ingin membatalkan proses import
    }
  }

  // Panggil Service Import Khusus (Logika Bisnis Import ada di sini)
  const summary = await processImportData(groupedOrders, userId);

  logger.info(`[ORCHESTRATOR] Selesai. Sukses: ${summary.processed}, Baru: ${summary.new}.`);

  return {
    processedInvoices: summary.processed,
    validItems: [],
    invalidSkus: summary.errors.map((e) => `[${e.invoice}] ${e.error}`),
  };
};
