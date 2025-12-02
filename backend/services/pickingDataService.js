// backend/services/pickingDataService.js
import db from "../config/db.js";
import { WMS_STATUS, MP_STATUS } from "../config/wmsConstants.js";
import { processImportData } from "./pickingImportService.js"; // Kita pisahkan logika import biar rapi

// ==============================================================================
// 1. READ OPERATIONS (Untuk Frontend UI)
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

      -- [FIX] Ambil Stok Tersedia berdasarkan ProductID + LocationID
      (
        SELECT sl.quantity
        FROM stock_locations sl
        WHERE sl.location_id = pli.suggested_location_id
          AND sl.product_id = pli.product_id
        LIMIT 1
      ) as available_stock

    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id

    WHERE pl.status IN (?, ?) -- PENDING, VALIDATED
      AND pl.is_active = 1
      AND pli.status NOT IN (?, ?) -- COMPLETED, CANCEL
    ORDER BY pl.created_at DESC, location_code ASC
  `;

  const [rows] = await db.query(query, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
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
      pl.id as picking_list_id,
      pl.original_invoice_id,
      pl.source,
      pl.status,
      pl.marketplace_status,
      pl.customer_name,
      pl.created_at,
      pl.order_date,

      -- [NEW] Data Item Detail
      pli.id as item_id,
      pli.original_sku as sku,
      pli.quantity,
      pli.status as item_status,
      p.name as product_name

    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    LEFT JOIN products p ON pli.product_id = p.id

    -- Filter: Ambil yang BUKAN status aktif (PENDING/VALIDATED)
    WHERE pl.status NOT IN (?, ?)

    -- Urutkan dari terbaru
    ORDER BY pl.created_at DESC, pl.id DESC
    LIMIT ?
  `;

  const [rows] = await db.query(query, [WMS_STATUS.PENDING, WMS_STATUS.VALIDATED, limit]);
  return rows;
};

/**
 * Mengambil detail satu picking list (untuk Modal Detail)
 */
export const fetchPickingListDetails = async (pickingListId) => {
  const query = `
    SELECT
        pli.original_sku as sku,
        pli.quantity as qty,
        p.name,
        pli.status
    FROM picking_list_items pli
    JOIN products p ON pli.product_id = p.id
    WHERE pli.picking_list_id = ?
  `;
  const [items] = await db.query(query, [pickingListId]);
  return items;
};

// ==============================================================================
// 2. WRITE OPERATIONS (Aksi User Gudang)
// ==============================================================================

/**
 * Membatalkan Picking List (Manual oleh User)
 */
export const cancelPickingListService = async (pickingListId, userId, reason) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Soft Delete Header (Set Active NULL, Status CANCEL)
    const [res] = await connection.query(
      `UPDATE picking_lists
        SET status = ?, is_active = NULL, updated_at = NOW()
        WHERE id = ?`,
      [WMS_STATUS.CANCEL, pickingListId]
    );

    if (res.affectedRows === 0)
      throw new Error("Picking List tidak ditemukan atau sudah diproses.");

    // Update Status Item jadi CANCEL juga
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
 * Menyelesaikan Item Picking (Checklist barang)
 */
export const completePickingItemsService = async (itemIds, userId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (!itemIds?.length) throw new Error("Tidak ada item dipilih.");

    const placeholders = itemIds.map(() => "?").join(",");

    // 1. Tandai Item Selesai (Disini kita bisa pakai status khusus atau flag)
    // Sesuai diskusi, kita pakai 'VALIDATED' sebagai "Ready to Pack",
    // tapi jika ini tahap akhir ("Selesai Pick"), mungkin butuh status 'PICKED' atau tetap 'VALIDATED' dan hilangkan dari view.
    // Asumsi: Status 'COMPLETED' digunakan untuk menandai selesai picking secara internal item.

    // UPDATE: Menggunakan status 'VALIDATED' (atau status baru 'PICKED' jika mau spesifik)
    // Untuk saat ini saya gunakan 'VALIDATED' + Logic Query Frontend filter out.
    // Atau jika Anda ingin status COMPLETED untuk internal item:
    const COMPLETED_ITEM_STATUS = "COMPLETED"; // Bisa diubah di constants

    await connection.query(
      `UPDATE picking_list_items SET status = ? WHERE id IN (${placeholders})`,
      [COMPLETED_ITEM_STATUS, ...itemIds]
    );

    // 2. Cek Header Auto-Complete
    const [headers] = await connection.query(
      `SELECT DISTINCT picking_list_id FROM picking_list_items WHERE id IN (${placeholders})`,
      itemIds
    );

    for (const { picking_list_id } of headers) {
      const [remaining] = await connection.query(
        `SELECT COUNT(*) as count FROM picking_list_items
          WHERE picking_list_id = ? AND status != ? AND status != ?`,
        [picking_list_id, COMPLETED_ITEM_STATUS, WMS_STATUS.CANCEL]
      );

      // Jika semua item selesai/batal, arsipkan header
      if (remaining[0].count === 0) {
        await connection.query(
          `UPDATE picking_lists SET status = ?, is_active = NULL, updated_at = NOW() WHERE id = ?`,
          ["COMPLETED", picking_list_id] // Status Akhir Header
        );
      }
    }

    // TODO: Insert STOCK_MOVEMENTS di sini jika pengurangan stok terjadi saat picking

    await connection.commit();
    return { success: true, message: `${itemIds.length} item berhasil diselesaikan.` };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ==============================================================================
// 3. IMPORT ORCHESTRATOR (Logic Hybrid Baru)
// ==============================================================================

/**
 * Menerima data hasil parsing Excel, lalu menyimpannya ke DB dengan logika Hybrid
 */
export const performPickingValidation = async (payload) => {
  const { items, userId, source, originalFilename } = payload;

  console.log(`[ORCHESTRATOR] Menerima ${items.length} baris data.`);

  // 1. Grouping Data per Invoice (Format Map untuk helper processImportData)
  const groupedOrders = new Map();

  items.forEach((item) => {
    if (!item.invoiceId) return;

    if (!groupedOrders.has(item.invoiceId)) {
      groupedOrders.set(item.invoiceId, {
        invoiceId: item.invoiceId,
        customer: item.customer,
        orderDate: item.orderDate,
        status: item.status, // MP_STATUS dari parser
        source: source,
        items: [],
      });
    }

    groupedOrders.get(item.invoiceId).items.push({
      sku: item.sku,
      qty: item.qty,
    });
  });

  console.log(`[ORCHESTRATOR] Terdeteksi ${groupedOrders.size} Invoice unik.`);

  // 2. Panggil Service Import Khusus (Logika Hybrid ada di sini)
  // Pastikan Anda sudah membuat file 'pickingImportService.js' dengan kode 'processImportData' sebelumnya
  const summary = await processImportData(groupedOrders, userId);

  console.log(
    `[ORCHESTRATOR] Selesai. Processed: ${summary.processed}, New: ${summary.new}, Updated: ${summary.updated}`
  );

  return {
    processedInvoices: summary.processed,
    validItems: [], // Frontend mungkin butuh ini untuk feedback visual, bisa disesuaikan
    invalidSkus: summary.errors.map((e) => `[${e.invoice}] ${e.error}`),
  };
};
