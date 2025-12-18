// backend/repositories/returnRepository.js
import { WMS_STATUS } from "../config/wmsConstants.js";

/**
 * Mengambil item dari Picking List yang statusnya 'RETURNED' (Siap divalidasi gudang)
 */
export const getPendingReturns = async (connection) => {
  const query = `
    SELECT
      pli.id,
      pli.picking_list_id,
      pli.product_id,
      pli.original_sku as sku,
      pli.quantity,
      p.name as product_name,
      p.price,
      pl.original_invoice_id,
      pl.source,
      pl.customer_name,
      pl.marketplace_status,
      pl.created_at as order_date
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    WHERE pli.status = ?
      AND pl.is_active = 1
    ORDER BY pl.created_at DESC
  `;

  // Menggunakan WMS_STATUS.RETURNED atau fallback string 'RETURNED'
  const [rows] = await connection.query(query, [WMS_STATUS?.RETURNED || "RETURNED"]);
  return rows;
};

/**
 * Mengambil Riwayat Retur (Gabungan dari Picking List Items & Manual Returns)
 */
export const getReturnHistory = async (connection, limit = 1000) => {
  const query = `
    SELECT * FROM (
      -- Retur Marketplace (Picking Items)
      SELECT
        'MARKETPLACE' as type,
        pli.id,
        pl.original_invoice_id as reference,
        p.name as product_name,
        pli.original_sku as sku,
        pli.quantity,
        pli.return_condition as \`condition\`,
        pli.return_notes as notes,
        l.code as location_code,
        pl.updated_at as date
      FROM picking_list_items pli
      JOIN picking_lists pl ON pli.picking_list_id = pl.id
      JOIN products p ON pli.product_id = p.id
      LEFT JOIN locations l ON pli.confirmed_location_id = l.id
      WHERE pli.status = 'COMPLETED_RETURN'

      UNION ALL

      -- Retur Manual
      SELECT
        'MANUAL' as type,
        mr.id,
        mr.reference,
        p.name as product_name,
        p.sku,
        mr.quantity,
        mr.\`condition\`,
        mr.notes,
        NULL as location_code, -- Manual return tidak memiliki link langsung ke locations di view ini
        mr.created_at as date
      FROM manual_returns mr
      JOIN products p ON mr.product_id = p.id
    ) as combined_history
    ORDER BY date DESC
    LIMIT ?
  `;

  const [rows] = await connection.query(query, [limit]);
  return rows;
};

/**
 * Ambil detail satu item picking berdasarkan ID
 */
export const getItemById = async (connection, itemId) => {
  const [rows] = await connection.query(`SELECT * FROM picking_list_items WHERE id = ?`, [itemId]);
  return rows[0] || null;
};

/**
 * Update item picking menjadi COMPLETED_RETURN
 * Digunakan saat item retur divalidasi dan diterima gudang.
 */
export const completeReturnItem = async (connection, itemId, { condition, notes, locationId }) => {
  return connection.query(
    `UPDATE picking_list_items
     SET
       status = 'COMPLETED_RETURN',
       return_condition = ?,
       return_notes = ?,
       confirmed_location_id = ?
     WHERE id = ?`,
    [condition, notes, locationId, itemId]
  );
};

/**
 * Kurangi Qty Item (Untuk Split/Partial Return)
 * Mengurangi jumlah item di baris picking list saat ini (sisa yang tidak diretur/belum diproses).
 */
export const decreaseItemQty = async (connection, itemId, qtyToDeduct) => {
  return connection.query(`UPDATE picking_list_items SET quantity = quantity - ? WHERE id = ?`, [
    qtyToDeduct,
    itemId,
  ]);
};

/**
 * Buat Item Baru untuk Retur (Split)
 * Jika retur hanya sebagian, item lama dikurangi qty-nya, dan item baru dibuat dengan status COMPLETED_RETURN.
 */
export const createSplitReturnItem = async (
  connection,
  originItem,
  { qtyReturn, condition, notes, locationId }
) => {
  const [res] = await connection.query(
    `INSERT INTO picking_list_items
      (picking_list_id, product_id, original_sku, quantity, status, return_condition, return_notes, confirmed_location_id, suggested_location_id, picked_from_location_id)
     VALUES (?, ?, ?, ?, 'COMPLETED_RETURN', ?, ?, ?, ?, ?)`,
    [
      originItem.picking_list_id,
      originItem.product_id,
      originItem.original_sku,
      qtyReturn,
      condition,
      notes,
      locationId,
      originItem.suggested_location_id,
      originItem.picked_from_location_id,
    ]
  );
  return res.insertId;
};

/**
 * Buat Data Retur Manual (Barang Offline/Tanpa Invoice System)
 */
export const createManualReturn = async (
  connection,
  { userId, productId, quantity, condition, reference, notes }
) => {
  return connection.query(
    `INSERT INTO manual_returns
      (user_id, product_id, quantity, \`condition\`, reference, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', NOW())`,
    [userId, productId, quantity, condition, reference, notes]
  );
};
