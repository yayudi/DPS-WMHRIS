// backend\services\pickingDataService.js
import db from "../config/db.js";
import { logAudit } from "../utils/logger.js"; // Pastikan path ini benar sesuai struktur project Anda

// [CRITICAL] IMPORT HELPER YANG SUDAH DIBERI DEBUG LOGS
// Pastikan file pickingValidationHelper.js ada di folder: backend/services/helpers/
import {
  handleExistingInvoices,
  fetchReferenceData,
  calculateValidations,
  insertPickingHeader,
  insertPickingItems,
  enrichComponentWithStock,
} from "./helpers/pickingValidationHelper.js";

// ==============================================================================
// 1. TASK MANAGEMENT (Read Ops - Tetap di sini)
// ==============================================================================

export const getPendingPickingItemsService = async () => {
  // Query untuk mengambil daftar tugas di frontend
  const query = `
    SELECT
      pli.id, pli.picking_list_id, pli.product_id, pli.original_sku as sku, pli.quantity, pli.status,
      pli.picked_from_location_id as location_code, pli.suggested_location_id,
      p.name as product_name, pl.original_invoice_id, pl.source, pl.order_date, pl.created_at,
      (SELECT quantity FROM stock_locations sl WHERE sl.id = pli.suggested_location_id) as available_stock
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    WHERE pl.status IN ('PENDING', 'PENDING_VALIDATION')
      AND pl.is_active = 1
      AND pli.status NOT IN ('COMPLETED', 'CANCELLED')
    ORDER BY pl.created_at DESC
  `;
  const [rows] = await db.query(query);
  return rows;
};

export const getHistoryPickingItemsService = async (limit = 1000) => {
  const query = `
    SELECT
      pl.id as picking_list_id, pl.original_invoice_id, pl.source, pl.status,
      pl.created_at, pl.order_date, u.username, COUNT(pli.id) as total_items
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
// 2. WRITE OPS (Cancel & Complete - Tetap di sini)
// ==============================================================================

export const cancelPickingListService = async (pickingListId, userId, reason) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Soft Delete Header (is_active = NULL) agar bisa direvisi
    const [res] = await connection.query(
      `UPDATE picking_lists SET status = 'CANCELLED', is_active = NULL, updated_at = NOW() WHERE id = ?`,
      [pickingListId]
    );
    if (res.affectedRows === 0)
      throw new Error("Picking List tidak ditemukan atau sudah diproses.");

    // 2. Cancel Items
    await connection.query(
      `UPDATE picking_list_items SET status = 'CANCELLED' WHERE picking_list_id = ?`,
      [pickingListId]
    );

    // 3. Log Audit
    if (logAudit) {
      await logAudit(
        userId,
        "CANCEL_PICKING",
        "picking_lists",
        pickingListId,
        reason || "User cancellation"
      );
    }

    await connection.commit();
    return {
      success: true,
      message: "Picking List dibatalkan. Invoice ini sekarang bisa diupload ulang (revisi).",
    };
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

    // 1. Mark Items Completed
    await connection.query(
      `UPDATE picking_list_items SET status = 'COMPLETED' WHERE id IN (${placeholders})`,
      itemIds
    );

    // 2. Check Header Completeness
    const [headers] = await connection.query(
      `SELECT DISTINCT picking_list_id FROM picking_list_items WHERE id IN (${placeholders})`,
      itemIds
    );

    for (const { picking_list_id } of headers) {
      const [remaining] = await connection.query(
        `SELECT COUNT(*) as count FROM picking_list_items WHERE picking_list_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [picking_list_id]
      );
      if (remaining[0].count === 0) {
        // Tutup Picking List (Archive)
        await connection.query(
          `UPDATE picking_lists SET status = 'COMPLETED', is_active = NULL, updated_at = NOW() WHERE id = ?`,
          [picking_list_id]
        );
      }
    }

    await connection.commit();
    return { success: true, message: "Item berhasil ditandai selesai." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// ==============================================================================
// 3. VALIDATION ORCHESTRATOR (Jembatan ke Helper)
// ==============================================================================

/**
 * Main Orchestrator: Menerima request validasi dan meneruskannya ke Helper
 */
export async function performPickingValidation(payload) {
  const { items, userId, source, originalFilename, originalInvoiceId, customerName, orderDate } =
    payload;
  let connection;

  try {
    console.log("[ORCHESTRATOR] Memulai validasi picking..."); // Debug log level atas
    connection = await db.getConnection();

    // 1. Panggil Helper: Cek Invoice Lama (Smart Upsert)
    // Di sinilah logika "Revisi Otomatis" bekerja
    const itemsToProcess = await handleExistingInvoices(connection, items);

    console.log(`[ORCHESTRATOR] Item yang lolos untuk diproses: ${itemsToProcess.length}`);

    if (itemsToProcess.length === 0) {
      return {
        pickingListId: null,
        validItems: [],
        invalidSkus: [],
        message: "Status pesanan diperbarui. Tidak ada tugas baru untuk dipicking.",
      };
    }

    // 2. Panggil Helper: Ambil Data DB
    const skus = itemsToProcess.map((i) => i.sku);
    const dbData = await fetchReferenceData(connection, skus);

    // 3. Panggil Helper: Hitung Logika Validasi
    // Gunakan map untuk qty agar akurat
    const validationResult = calculateValidations(itemsToProcess, dbData);

    // 4. Panggil Helper: Insert ke Database
    await connection.beginTransaction();

    const headerId = await insertPickingHeader(connection, {
      userId,
      source,
      originalFilename,
      originalInvoiceId,
      customerName,
      orderDate,
    });

    await insertPickingItems(
      connection,
      headerId,
      validationResult.validItems,
      dbData.validProductMap
    );

    await connection.commit();

    console.log(`[ORCHESTRATOR] Sukses! Picking List ID: ${headerId}`);
    return { pickingListId: headerId, ...validationResult };
  } catch (error) {
    if (connection) await connection.rollback();
    // Tangani error Race Condition MySQL
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(
        `Invoice ${originalInvoiceId} sedang diproses oleh user lain (Race Condition).`
      );
    }
    console.error("[ORCHESTRATOR ERROR]", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Main Orchestrator: Detail Picking List
 */
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
    // Reuse Helper Fetch Data
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
          // Reuse Helper Enrich
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
