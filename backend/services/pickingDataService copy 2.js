// backend\services\pickingDataService.js
import db from "../config/db.js";
import { logDebug } from "../utils/logger.js";

// Import Helpers
import {
  handleExistingInvoices,
  fetchReferenceData,
  calculateValidations,
  insertPickingHeader,
  insertPickingItems,
  enrichComponentWithStock,
} from "./helpers/pickingValidationHelper.js";

// ==============================================================================
// 1. TASK MANAGEMENT (READ OPS)
// ==============================================================================

export const getPendingPickingItemsService = async () => {
  // Query untuk mengambil item yang status picking list-nya PENDING/VALIDATION
  // Dan item-nya belum selesai/dibatalkan
  const query = `
    SELECT
      pli.id, pli.picking_list_id, pli.product_id, pli.original_sku as sku, pli.quantity, pli.status,
      pli.picked_from_location_id, pli.suggested_location_id,

      -- Ambil Kode Lokasi Display/Gudang
      COALESCE(loc_picked.code, loc_suggested.code) as location_code,

      p.name as product_name,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at, pl.customer_name,

      -- Cek Stok Tersedia di Lokasi yang Disarankan
      (SELECT quantity FROM stock_locations sl WHERE sl.id = pli.suggested_location_id) as available_stock

    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id

    WHERE pl.status IN ('PENDING', 'PENDING_VALIDATION')
      AND pl.is_active = 1
      AND pli.status NOT IN ('COMPLETED', 'CANCELLED')
    ORDER BY pl.created_at DESC, location_code ASC
  `;

  const [rows] = await db.query(query);
  return rows;
};

export const getHistoryPickingItemsService = async (limit = 1000) => {
  const query = `
    SELECT
      pl.id as picking_list_id, pl.original_invoice_id, pl.source, pl.status, pl.customer_name,
      pl.created_at, pl.order_date, u.username,
      COUNT(pli.id) as total_items,
      SUM(CASE WHEN pli.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_items
    FROM picking_lists pl
    LEFT JOIN users u ON pl.user_id = u.id
    LEFT JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    WHERE pl.status != 'PENDING_VALIDATION'
    GROUP BY pl.id
    ORDER BY pl.created_at DESC LIMIT ?
  `;
  const [rows] = await db.query(query, [limit]);
  return rows;
};

// ==============================================================================
// 2. WRITE OPS (Cancel & Complete)
// ==============================================================================

export const cancelPickingListService = async (pickingListId, userId, reason) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Soft Delete Header (Set Active NULL, Status CANCELLED)
    const [res] = await connection.query(
      `UPDATE picking_lists SET status = 'CANCELLED', is_active = NULL, updated_at = NOW() WHERE id = ?`,
      [pickingListId]
    );
    if (res.affectedRows === 0)
      throw new Error("Picking List tidak ditemukan atau sudah diproses.");

    // Update Status Item
    await connection.query(
      `UPDATE picking_list_items SET status = 'CANCELLED' WHERE picking_list_id = ?`,
      [pickingListId]
    );

    // Audit Log opsional bisa ditambahkan di sini

    await connection.commit();
    return { success: true, message: "Picking List dibatalkan." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const completePickingItemsService = async (itemIds, userId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (!itemIds?.length) throw new Error("Tidak ada item dipilih.");

    const placeholders = itemIds.map(() => "?").join(",");

    // 1. Tandai Item Selesai
    await connection.query(
      `UPDATE picking_list_items SET status = 'COMPLETED' WHERE id IN (${placeholders})`,
      itemIds
    );

    // 2. Cek Logika Header (Apakah semua item dalam 1 invoice sudah selesai?)
    // Ambil semua Picking List ID yang terlibat
    const [headers] = await connection.query(
      `SELECT DISTINCT picking_list_id FROM picking_list_items WHERE id IN (${placeholders})`,
      itemIds
    );

    for (const { picking_list_id } of headers) {
      // Hitung sisa item yang BELUM selesai/batal
      const [remaining] = await connection.query(
        `SELECT COUNT(*) as count FROM picking_list_items
         WHERE picking_list_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [picking_list_id]
      );

      // Jika sisa 0, tandai Header Picking List sebagai COMPLETED (Archived)
      if (remaining[0].count === 0) {
        await connection.query(
          `UPDATE picking_lists SET status = 'COMPLETED', is_active = NULL, updated_at = NOW() WHERE id = ?`,
          [picking_list_id]
        );
      }
    }

    // DISINI HARUSNYA ADA LOGIKA PENGURANGAN STOK FISIK (STOCK_MOVEMENTS)
    // Asumsi: Logika pengurangan stok sudah ditangani oleh fungsi lain atau trigger,
    // atau ditambahkan di sini sesuai kebutuhan bisnis.

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
// 3. VALIDATION ORCHESTRATOR (REFACTORED: MULTI-INVOICE SUPPORT)
// ==============================================================================

export async function performPickingValidation(payload) {
  const { items, userId, source, originalFilename } = payload;
  let connection;

  try {
    console.log(`[ORCHESTRATOR] Menerima ${items.length} baris data mentah.`);

    // --- LANGKAH 1: GROUPING PER INVOICE ---
    // Agar 1 Baris di Tabel Picking List = 1 Invoice
    const groupedByInvoice = items.reduce((acc, item) => {
      // Gunakan 'UNKNOWN' + Timestamp jika invoice ID kosong (untuk mencegah crash)
      const key = item.invoiceId || `UNK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const invoiceKeys = Object.keys(groupedByInvoice);
    console.log(`[ORCHESTRATOR] Terdeteksi ${invoiceKeys.length} Invoice unik.`);

    connection = await db.getConnection();

    // Optimasi: Ambil Referensi SKU DB sekali saja untuk semua item
    const allSkus = items.map((i) => i.sku);
    // Hapus duplikat SKU untuk query
    const uniqueSkus = [...new Set(allSkus)];
    const dbData = await fetchReferenceData(connection, uniqueSkus);

    await connection.beginTransaction();

    const resultSummary = {
      validItems: [],
      invalidSkus: [],
      processedInvoices: 0,
    };

    // --- LANGKAH 2: LOOPING PER INVOICE ---
    for (const invoiceId of invoiceKeys) {
      const invoiceItems = groupedByInvoice[invoiceId];

      // Ambil metadata dari baris pertama invoice ini
      const firstRow = invoiceItems[0];
      const customerName = firstRow.customer || null;
      // Gunakan waktu sekarang sebagai order_date default jika tidak ada info di file
      const orderDate = new Date();

      // A. Cek Revisi (Smart Upsert)
      // Cek apakah invoice ini sudah ada di DB. Jika ada & status PENDING, data lama di-cancel.
      const itemsToProcess = await handleExistingInvoices(connection, invoiceItems);

      // Jika itemsToProcess kosong, berarti invoice ini sudah SHIPPED/COMPLETED, jadi skip.
      if (itemsToProcess.length === 0) {
        continue;
      }

      // B. Hitung Validasi (Stok & Lokasi)
      const validation = calculateValidations(itemsToProcess, dbData);

      // Catat error jika ada SKU yang tidak ditemukan / Paket tanpa komponen
      if (validation.invalidSkus.length > 0) {
        // Tambahkan konteks Invoice ID ke pesan error
        const contextualErrors = validation.invalidSkus.map((msg) => `[${invoiceId}] ${msg}`);
        resultSummary.invalidSkus.push(...contextualErrors);
      }

      // C. Insert ke Database (Header & Items)
      if (validation.validItems.length > 0) {
        // 1. Buat Header Picking List (Satu per Invoice)
        const headerId = await insertPickingHeader(connection, {
          userId,
          source,
          originalFilename,
          originalInvoiceId: invoiceId, // Penting: Invoice ID Asli
          customerName,
          orderDate,
        });

        // 2. Buat Detail Items
        await insertPickingItems(
          connection,
          headerId,
          validation.validItems,
          dbData.validProductMap
        );

        // Kumpulkan hasil sukses untuk response
        resultSummary.validItems.push(...validation.validItems);
        resultSummary.processedInvoices++;
      }
    }

    await connection.commit();
    console.log(
      `[ORCHESTRATOR] Selesai. ${resultSummary.processedInvoices} Invoice berhasil dibuat.`
    );

    return resultSummary;
  } catch (error) {
    if (connection) await connection.rollback();
    // Tangani Race Condition khusus unique key
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`Konflik Data: Invoice sedang diproses oleh user lain.`);
    }
    console.error("[ORCHESTRATOR ERROR]", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

export async function fetchPickingListDetails(pickingListId) {
  const connection = await db.getConnection();
  try {
    const [items] = await connection.query(
      `SELECT pli.original_sku, pli.quantity, p.id as product_id, p.is_package
       FROM picking_list_items pli JOIN products p ON pli.product_id = p.id WHERE pli.picking_list_id = ?`,
      [pickingListId]
    );
    if (!items.length) return [];

    const skus = [...new Set(items.map((i) => i.original_sku))];
    const dbData = await fetchReferenceData(connection, skus);

    return items
      .map((item) => {
        const product = dbData.validProductMap.get(item.original_sku);
        if (!product) return null;

        let components = null;
        let locations = [];
        let qtyNeeded = item.quantity;

        if (product.is_package) {
          const comps = dbData.componentsByPackageId.get(product.id) || [];
          components = comps.map((c) => enrichComponentWithStock(c, qtyNeeded, dbData));
        } else {
          const locs = dbData.locationsByProductId.get(product.id) || [];
          locations = locs.filter((l) => l.quantity >= qtyNeeded);
        }

        return {
          sku: item.original_sku,
          name: product.name,
          qty: qtyNeeded,
          is_package: !!product.is_package,
          components,
          availableLocations: locations,
          suggestedLocationId: locations[0]?.location_id || null,
        };
      })
      .filter((i) => i !== null);
  } catch (error) {
    console.error(`Error fetchPickingListDetails #${pickingListId}:`, error);
    throw error;
  } finally {
    connection.release();
  }
}
