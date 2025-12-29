// backend/repositories/pickingRepository.js
import { WMS_STATUS } from "../config/wmsConstants.js";

// ============================================================================
// READ OPERATIONS
// ============================================================================

export const getPendingItems = async (connection) => {
  const query = `
    SELECT
      pli.id,
      pli.picking_list_id,
      pli.product_id,
      pli.original_sku as sku,
      pli.quantity,
      pli.status,
      COALESCE(loc_picked.code, loc_suggested.code) as location_code,
      p.name as product_name,
      pl.original_invoice_id,
      pl.source,
      pl.order_date,
      pl.created_at,
      pl.customer_name,
      pl.marketplace_status,
      COALESCE(sl.quantity, 0) as available_stock
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
    -- Join stok berdasarkan lokasi yang disarankan
    LEFT JOIN stock_locations sl ON sl.location_id = pli.suggested_location_id AND sl.product_id = pli.product_id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status = ?
    ORDER BY pl.created_at DESC, location_code ASC
  `;

  const [rows] = await connection.query(query, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
  ]);
  return rows;
};

export const getHistoryItems = async (connection, limit = 1000) => {
  const query = `
    SELECT
      pl.id as picking_list_id, pl.original_invoice_id, pl.source, pl.status,
      pl.marketplace_status, pl.customer_name, pl.created_at, pl.order_date,
      pli.id as item_id, pli.original_sku as sku, pli.quantity, pli.status as item_status,
      pli.return_condition, pli.return_notes,
      p.name as product_name
    FROM picking_lists pl
    JOIN picking_list_items pli ON pl.id = pli.picking_list_id
    LEFT JOIN products p ON pli.product_id = p.id
    WHERE pl.status NOT IN (?)
    ORDER BY pl.created_at DESC, pl.id DESC
    LIMIT ?
  `;

  const [rows] = await connection.query(query, [WMS_STATUS.PENDING, limit]);
  return rows;
};

export const getListDetails = async (connection, pickingListId) => {
  const query = `
    SELECT
      pli.id,
      pli.original_sku as sku,
      pli.quantity as qty,
      p.name,
      pli.status,
      pli.return_condition,
      pli.return_notes
    FROM picking_list_items pli
    JOIN products p ON pli.product_id = p.id
    WHERE pli.picking_list_id = ?
  `;
  const [items] = await connection.query(query, [pickingListId]);
  return items;
};

// Added original_sku so Service can log errors properly
export const getItemsByIds = async (connection, itemIds) => {
  if (itemIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, picking_list_id, suggested_location_id, product_id, quantity, original_sku, status
      FROM picking_list_items WHERE id IN (?)`,
    [itemIds]
  );
  return rows;
};

export const countPendingItems = async (connection, listId) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM picking_list_items
     WHERE picking_list_id = ? AND status NOT IN ('VALIDATED', 'CANCEL', 'COMPLETED', 'RETURNED', 'OBSOLETE', 'ERROR')`,
    [listId]
  );
  return rows[0].count;
};

export const findActiveHeaderByInvoice = async (connection, invoiceId) => {
  const [rows] = await connection.query(
    "SELECT id, status FROM picking_lists WHERE original_invoice_id = ? AND is_active = 1",
    [invoiceId]
  );
  return rows.length > 0 ? rows[0] : null;
};

// Required for Safety Check in pickingDataService
export const getHeaderById = async (connection, listId) => {
  const [rows] = await connection.query(
    "SELECT id, original_invoice_id, status, is_active, marketplace_status FROM picking_lists WHERE id = ?",
    [listId]
  );
  return rows.length > 0 ? rows[0] : null;
};

export const getItemsForComparison = async (connection, listId) => {
  const [rows] = await connection.query(
    "SELECT original_sku as sku, quantity as qty FROM picking_list_items WHERE picking_list_id = ?",
    [listId]
  );
  return rows;
};

export const getExistingItemSkus = async (connection, listId) => {
  const [rows] = await connection.query(
    "SELECT original_sku FROM picking_list_items WHERE picking_list_id = ?",
    [listId]
  );
  return new Set(rows.map((i) => i.original_sku));
};

// ============================================================================
// WRITE OPERATIONS (UPDATE)
// ============================================================================

export const cancelHeader = async (connection, listId) => {
  return connection.query(
    `UPDATE picking_lists SET status = ?, is_active = NULL, updated_at = NOW() WHERE id = ?`,
    [WMS_STATUS.CANCEL, listId]
  );
};

// Update Header Status
export const updateHeaderStatus = async (connection, listId, status, isActive) => {
  return connection.query(`UPDATE picking_lists SET status = ?, is_active = ? WHERE id = ?`, [
    status,
    isActive,
    listId,
  ]);
};

// Update Items Status by List ID
export const updateItemsStatusByListId = async (connection, listId, status) => {
  return connection.query(`UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`, [
    status,
    listId,
  ]);
};

// Archives header by renaming with _REV_ suffix
export const archiveHeader = async (connection, listId) => {
  return connection.query(
    `UPDATE picking_lists
      SET status = 'OBSOLETE',
        is_active = NULL,
        original_invoice_id = CONCAT(original_invoice_id, '_REV_', id),
        updated_at = NOW()
      WHERE id = ?`,
    [listId]
  );
};

export const cancelItemsByListId = async (connection, listId) => {
  return connection.query(`UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`, [
    WMS_STATUS.CANCEL,
    listId,
  ]);
};

export const updateSuggestedLocation = async (connection, itemId, locationId) => {
  console.log("Updating suggested location:", { itemId, locationId });
  return connection.query(`UPDATE picking_list_items SET suggested_location_id = ? WHERE id = ?`, [
    locationId,
    itemId,
  ]);
};

// PENTING: Fungsi ini mengupdate status sekaligus mengunci lokasi final
export const validateItem = async (connection, itemId, locationId) => {
  return connection.query(
    `UPDATE picking_list_items
      SET status = 'VALIDATED', picked_from_location_id = ?, confirmed_location_id = ?
      WHERE id = ?`,
    [locationId, locationId, itemId]
  );
};

// Opsional: Jika Anda butuh fungsi khusus untuk update status saja tanpa lokasi
export const updateItemStatus = async (connection, itemId, status) => {
  return connection.query(`UPDATE picking_list_items SET status = ? WHERE id = ?`, [
    status,
    itemId,
  ]);
};

// Marks specific item as RETURNED with condition notes
export const markItemAsReturned = async (connection, itemId, condition, notes) => {
  return connection.query(
    `UPDATE picking_list_items
      SET status = 'RETURNED',
        return_condition = ?,
        return_notes = ?
      WHERE id = ?`,
    [condition, notes, itemId]
  );
};

export const validateHeader = async (connection, listId) => {
  return connection.query(
    `UPDATE picking_lists SET status = 'VALIDATED', updated_at = NOW() WHERE id = ?`,
    [listId]
  );
};

// Updates Marketplace status, optionally syncing WMS status too
export const updateMarketplaceStatus = async (connection, listId, mpStatus, wmsStatus = null) => {
  if (wmsStatus) {
    return connection.query(
      `UPDATE picking_lists SET marketplace_status = ?, status = ? WHERE id = ?`,
      [mpStatus, wmsStatus, listId]
    );
  }
  return connection.query(`UPDATE picking_lists SET marketplace_status = ? WHERE id = ?`, [
    mpStatus,
    listId,
  ]);
};

// Bulk Check Existing Invoices (ACTIVE ONLY)
export const getActiveHeadersByInvoiceIds = async (connection, invoiceIds) => {
  if (invoiceIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, original_invoice_id, status, marketplace_status
      FROM picking_lists
      WHERE original_invoice_id IN (?) AND is_active = 1`,
    [invoiceIds]
  );
  return rows;
};

// [NEW] Bulk Check Existing Invoices (ALL - Active & Inactive/Cancelled)
// Ini diperlukan untuk mendeteksi duplicate entry pada order yang sudah dicancel
export const getAllHeadersByInvoiceIds = async (connection, invoiceIds) => {
  if (invoiceIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, original_invoice_id, status, marketplace_status, is_active
      FROM picking_lists
      WHERE original_invoice_id IN (?)`,
    [invoiceIds]
  );
  return rows;
};

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

export const createHeader = async (
  connection,
  { userId, source, invoiceId, customer, orderDate, status, mpStatus, filename }
) => {
  const [res] = await connection.query(
    `INSERT INTO picking_lists (user_id, source, original_invoice_id, customer_name, order_date, status, marketplace_status, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [userId, source, invoiceId, customer, orderDate, status, mpStatus]
  );
  return res.insertId;
};

export const createItem = async (
  connection,
  { listId, productId, sku, qty, status, locationId = null }
) => {
  return connection.query(
    `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, status, suggested_location_id)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [listId, productId, sku, qty, status, locationId]
  );
};

// Bulk Create Items
export const createItemsBulk = async (connection, rows) => {
  if (rows.length === 0) return;
  return connection.query(
    `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity, status, suggested_location_id) VALUES ?`,
    [rows]
  );
};
