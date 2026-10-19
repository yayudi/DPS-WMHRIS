// backend/repositories/pickingRepository.js
import { WMS_STATUS } from "../config/wmsConstants.js";
import Logger from "../utils/logger.js";
import { buildTriStateWhere } from "../utils/sqlUtils.js";

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
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
      pl.location_purpose,
      pl.shop_name,
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
      AND pli.status IN (?, 'BACKORDER')
    ORDER BY pl.created_at DESC, location_code ASC
  `;

  const [rows] = await connection.query(query, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
  ]);
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} limit
 * @returns {Promise<any>}
 */
export const getHistoryItems = async (connection, limit = 1000) => {
  const query = `
    SELECT
      pl.id as picking_list_id, pl.original_invoice_id, pl.source, pl.status,
      pl.marketplace_status, pl.customer_name, pl.shop_name, pl.created_at, pl.order_date, pl.location_purpose,
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

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} pickingListId
 * @returns {Promise<any>}
 */
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
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemIds
 * @returns {Promise<any>}
 */
export const getItemsByIds = async (connection, itemIds) => {
  if (itemIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT id, picking_list_id, suggested_location_id, product_id, quantity, original_sku, status
      FROM picking_list_items WHERE id IN (?)`,
    [itemIds]
  );
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const countPendingItems = async (connection, listId) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) as count FROM picking_list_items
      WHERE picking_list_id = ? AND status NOT IN ('VALIDATED', 'VOID', 'COMPLETED', 'RETURNED', 'OBSOLETE', 'ERROR')`,
    [listId]
  );
  return rows[0].count;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} invoiceId
 * @returns {Promise<any>}
 */
export const findActiveHeaderByInvoice = async (connection, invoiceId) => {
  const [rows] = await connection.query(
    "SELECT id, status FROM picking_lists WHERE original_invoice_id = ? AND is_active = 1",
    [invoiceId]
  );
  return rows.length > 0 ? rows[0] : null;
};

// Required for Safety Check in pickingDataService
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const getHeaderById = async (connection, listId) => {
  const [rows] = await connection.query(
    "SELECT id, original_invoice_id, status, is_active, marketplace_status, location_purpose FROM picking_lists WHERE id = ?",
    [listId]
  );
  return rows.length > 0 ? rows[0] : null;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const getItemsForComparison = async (connection, listId) => {
  const [rows] = await connection.query(
    "SELECT original_sku as sku, quantity as qty FROM picking_list_items WHERE picking_list_id = ?",
    [listId]
  );
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const getExistingItemSkus = async (connection, listId) => {
  const [rows] = await connection.query(
    "SELECT original_sku FROM picking_list_items WHERE picking_list_id = ?",
    [listId]
  );
  return new Set(rows.map((i) => i.original_sku));
};

/**
 * Mengambil daftar sumber marketplace yang tersedia pada picking list aktif
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<Array<string>>}
 */
export const getStockRequirementSources = async (connection) => {
  const query = `
    SELECT DISTINCT pl.source
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status IN (?, 'BACKORDER')
      AND pl.source IS NOT NULL AND pl.source != ''
    ORDER BY pl.source ASC
  `;
  const [rows] = await connection.query(query, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
  ]);
  return rows.map((r) => r.source);
};

/**
 * Mengambil daftar location_purpose yang tersedia pada picking list aktif
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<Array<string>>}
 */
export const getStockRequirementLocationPurposes = async (connection) => {
  const query = `
    SELECT DISTINCT pl.location_purpose
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status IN (?, 'BACKORDER')
      AND pl.location_purpose IS NOT NULL AND pl.location_purpose != ''
    ORDER BY pl.location_purpose ASC
  `;
  const [rows] = await connection.query(query, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
  ]);
  return rows.map((r) => r.location_purpose);
};

/**
 * Mengambil rekap agregat kebutuhan stok terpaginasi & terfilter untuk item picking aktif
 * @param {import('mysql2/promise').Connection} connection
 * @param {{ search?: string, status?: string, source?: string, locationPurpose?: string, sortBy?: string, sortOrder?: string, page?: number, limit?: number }} options
 * @returns {Promise<{ summary: Object, items: Array<Object>, total: number }>}
 */

export const getStockRequirementsList = async (
  connection,
  {
    search = '',
    status = 'ALL',
    source = 'ALL',
    locationPurpose = 'ALL',
    sortBy = 'deficit',
    sortOrder = 'asc',
    page = 1,
    limit = 20,
  } = {}
) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (pageNum - 1) * limitNum;

  const sourceParams = [];
  const sourceClauses = buildTriStateWhere('pl.source', source, sourceParams);
  const sourceFilterSql = sourceClauses.length > 0 ? ` AND ${sourceClauses.join(' AND ')}` : '';

  const purposeParams = [];
  const purposeClauses = buildTriStateWhere('pl.location_purpose', locationPurpose, purposeParams);
  const purposeFilterSql = purposeClauses.length > 0 ? ` AND ${purposeClauses.join(' AND ')}` : '';

  const baseSql = `
    SELECT
      pli.original_sku as sku,
      MAX(p.id) as product_id,
      COALESCE(MAX(p.name), pli.original_sku) as product_name,
      CAST(SUM(pli.quantity) AS SIGNED) as total_required,
      COUNT(DISTINCT pl.id) as order_count,
      COUNT(pli.id) as item_count,
      GROUP_CONCAT(DISTINCT COALESCE(loc_picked.code, loc_suggested.code) ORDER BY COALESCE(loc_picked.code, loc_suggested.code) SEPARATOR ', ') as suggested_locations,
      CAST(COALESCE((
        SELECT SUM(sl.quantity)
        FROM stock_locations sl
        WHERE sl.product_id = MAX(p.id)
      ), 0) AS SIGNED) as total_stock
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status IN (?, 'BACKORDER')
      ${sourceFilterSql}
      ${purposeFilterSql}
    GROUP BY pli.original_sku
  `;

  const baseParams = [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
    ...sourceParams,
    ...purposeParams,
  ];

  const whereConditions = [];
  const filterParams = [];

  if (search && search.trim()) {
    whereConditions.push('(t.sku LIKE ? OR t.product_name LIKE ?)');
    const term = `%${search.trim()}%`;
    filterParams.push(term, term);
  }

  if (status === 'DEFICIT') {
    whereConditions.push('(t.total_stock - t.total_required) < 0');
  } else if (status === 'SUFFICIENT') {
    whereConditions.push('(t.total_stock - t.total_required) >= 0');
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sortFieldMap = {
    deficit: '(t.total_stock - t.total_required)',
    totalRequired: 't.total_required',
    totalStock: 't.total_stock',
    sku: 't.sku',
    orderCount: 't.order_count',
  };
  const orderCol = sortFieldMap[sortBy] || '(t.total_stock - t.total_required)';
  const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const orderSql = `ORDER BY ${orderCol} ${orderDir}, t.sku ASC`;

  // 1. Summary & Total Count
  const summaryQuery = `
    SELECT
      COUNT(*) as total_count,
      CAST(COALESCE(SUM(t.total_required), 0) AS SIGNED) as total_required_qty,
      CAST(COALESCE(SUM(t.total_stock), 0) AS SIGNED) as total_stock_qty,
      CAST(COALESCE(SUM(CASE WHEN (t.total_stock - t.total_required) < 0 THEN 1 ELSE 0 END), 0) AS SIGNED) as total_deficit_skus,
      CAST(COALESCE(SUM(CASE WHEN (t.total_stock - t.total_required) >= 0 THEN 1 ELSE 0 END), 0) AS SIGNED) as total_sufficient_skus
    FROM (${baseSql}) t ${whereSql}
  `;
  const [summaryRows] = await connection.query(summaryQuery, [...baseParams, ...filterParams]);
  const summary = summaryRows[0] || {
    total_count: 0,
    total_required_qty: 0,
    total_stock_qty: 0,
    total_deficit_skus: 0,
    total_sufficient_skus: 0,
  };

  // 2. Paginated Items
  const itemsQuery = `
    SELECT
      t.*,
      CAST((t.total_stock - t.total_required) AS SIGNED) as deficit,
      CASE WHEN (t.total_stock - t.total_required) < 0 THEN 'DEFICIT' ELSE 'SUFFICIENT' END as status
    FROM (${baseSql}) t
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `;
  const [items] = await connection.query(itemsQuery, [
    ...baseParams,
    ...filterParams,
    limitNum,
    offset,
  ]);

  return {
    summary: {
      totalSkus: Number(summary.total_count) || 0,
      totalRequiredQty: Number(summary.total_required_qty) || 0,
      totalStockQty: Number(summary.total_stock_qty) || 0,
      totalDeficitSkus: Number(summary.total_deficit_skus) || 0,
      totalSufficientSkus: Number(summary.total_sufficient_skus) || 0,
    },
    total: Number(summary.total_count) || 0,
    items,
  };
};

/**
 * Mengambil rincian lokasi stok fisik berdasarkan array product_id
 * @param {import('mysql2/promise').Connection} connection
 * @param {Array<number>} productIds
 * @returns {Promise<Array<Object>>}
 */
export const getStockLocationsByProductIds = async (connection, productIds) => {
  if (!productIds || productIds.length === 0) return [];
  const query = `
    SELECT
      sl.product_id,
      l.id as location_id,
      l.code as location_code,
      l.name as location_name,
      sl.quantity
    FROM stock_locations sl
    JOIN locations l ON sl.location_id = l.id
    WHERE sl.product_id IN (?) AND sl.quantity > 0
    ORDER BY l.code ASC
  `;
  const [rows] = await connection.query(query, [productIds]);
  return rows;
};

/**
 * Mengambil rincian pesanan (invoices) untuk satu SKU spesifik dengan pagination & sorting
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} sku
 * @param {{ page?: number, limit?: number, sortBy?: string, sortOrder?: string }} options
 * @returns {Promise<{ rows: Array<Object>, total: number }>}
 */
export const getStockRequirementOrdersBySku = async (
  connection,
  sku,
  { page = 1, limit = 10, sortBy = 'orderDate', sortOrder = 'desc' } = {}
) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const offset = (pageNum - 1) * limitNum;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status IN (?, 'BACKORDER')
      AND pli.original_sku = ?
  `;
  const [countRows] = await connection.query(countQuery, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
    sku,
  ]);
  const total = Number(countRows[0]?.total) || 0;

  const sortMap = {
    invoiceId: 'pl.original_invoice_id',
    source: 'pl.source',
    shopName: 'pl.shop_name',
    customerName: 'pl.customer_name',
    quantity: 'pli.quantity',
    itemStatus: 'pli.status',
    orderDate: 'pl.order_date',
    suggestedLocationCode: 'COALESCE(loc_picked.code, loc_suggested.code)',
  };
  const orderCol = sortMap[sortBy] || 'pl.order_date';
  const orderDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const rowsQuery = `
    SELECT
      pli.id as item_id,
      pli.original_sku as sku,
      pli.quantity,
      pli.status as item_status,
      pl.id as picking_list_id,
      pl.original_invoice_id as invoice_id,
      pl.source,
      pl.shop_name,
      pl.customer_name,
      pl.order_date,
      COALESCE(loc_picked.code, loc_suggested.code) as suggested_location_code
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
    WHERE pl.status IN (?, ?)
      AND pl.is_active = 1
      AND pli.status IN (?, 'BACKORDER')
      AND pli.original_sku = ?
    ORDER BY ${orderCol} ${orderDir}, pli.id ASC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await connection.query(rowsQuery, [
    WMS_STATUS.PENDING,
    WMS_STATUS.VALIDATED,
    WMS_STATUS.PENDING,
    sku,
    limitNum,
    offset,
  ]);

  return { rows, total };
};

// ============================================================================
// WRITE OPERATIONS (UPDATE)
// ============================================================================

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const voidHeader = async (connection, listId) => {
  return connection.query(
    `UPDATE picking_lists SET status = ?, is_active = NULL, updated_at = NOW() WHERE id = ?`,
    [WMS_STATUS.VOID, listId]
  );
};

// Update Header Status
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @param {any} status
 * @param {boolean} isActive
 * @returns {Promise<any>}
 */
export const updateHeaderStatus = async (connection, listId, status, isActive) => {
  return connection.query(`UPDATE picking_lists SET status = ?, is_active = ? WHERE id = ?`, [
    status,
    isActive,
    listId,
  ]);
};

// Update Items Status by List ID
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @param {any} status
 * @returns {Promise<any>}
 */
export const updateItemsStatusByListId = async (connection, listId, status) => {
  return connection.query(`UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`, [
    status,
    listId,
  ]);
};

// Archives header by renaming with _REV_ suffix
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
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

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const voidItemsByListId = async (connection, listId) => {
  return connection.query(`UPDATE picking_list_items SET status = ? WHERE picking_list_id = ?`, [
    WMS_STATUS.VOID,
    listId,
  ]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemId
 * @param {number|string} locationId
 * @returns {Promise<any>}
 */
export const updateSuggestedLocation = async (connection, itemId, locationId) => {
  Logger.info("Updating suggested location", "PICKING_REPO", { itemId, locationId });
  return connection.query(`UPDATE picking_list_items SET suggested_location_id = ? WHERE id = ?`, [
    locationId,
    itemId,
  ]);
};

// PENTING: Fungsi ini mengupdate status sekaligus mengunci lokasi final
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemId
 * @param {number|string} locationId
 * @returns {Promise<any>}
 */
export const validateItem = async (connection, itemId, locationId) => {
  return connection.query(
    `UPDATE picking_list_items
      SET status = 'VALIDATED', picked_from_location_id = ?, confirmed_location_id = ?
      WHERE id = ?`,
    [locationId, locationId, itemId]
  );
};

// Opsional: Jika Anda butuh fungsi khusus untuk update status saja tanpa lokasi
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemId
 * @param {any} status
 * @returns {Promise<any>}
 */
export const updateItemStatus = async (connection, itemId, status) => {
  return connection.query(`UPDATE picking_list_items SET status = ? WHERE id = ?`, [
    status,
    itemId,
  ]);
};

// Marks specific item as RETURNED with condition notes
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemId
 * @param {any} condition
 * @param {any} notes
 * @returns {Promise<any>}
 */
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

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<any>}
 */
export const validateHeader = async (connection, listId) => {
  return connection.query(
    `UPDATE picking_lists SET status = 'VALIDATED', updated_at = NOW() WHERE id = ?`,
    [listId]
  );
};

// Updates Marketplace status, optionally syncing WMS status too
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @param {any} mpStatus
 * @param {any} wmsStatus
 * @returns {Promise<any>}
 */
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
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} invoiceIds
 * @returns {Promise<any>}
 */
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

// Bulk Check Existing Invoices (ALL - Active & Inactive/Cancelled)
// Ini diperlukan untuk mendeteksi duplicate entry pada order yang sudah dicancel
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} invoiceIds
 * @returns {Promise<any>}
 */
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
  { userId, source, invoiceId, customer, orderDate, status, mpStatus, locationPurpose, shopName }
) => {
  const [res] = await connection.query(
    `INSERT INTO picking_lists (user_id, source, original_invoice_id, customer_name, order_date, status, marketplace_status, is_active, created_at, location_purpose, shop_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?)`,
    [userId, source, invoiceId, customer, orderDate, status, mpStatus, locationPurpose || "DISPLAY", shopName || null]
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
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {any} rows
 * @returns {Promise<any>}
 */
export const createItemsBulk = async (connection, rows) => {
  if (rows.length === 0) return;
  return connection.query(
    `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, price, quantity, status, suggested_location_id) VALUES ?`,
    [rows]
  );
};

/**
 * Mengambil item VALIDATED yang siap direstock saat pembatalan order.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} pickingListId
 * @returns {Promise<Array<{ product_id: number, quantity: number, confirmed_location_id: number }>>}
 */
export const getValidatedItemsForRestock = async (connection, pickingListId) => {
  const [rows] = await connection.query(
    `SELECT product_id, quantity, confirmed_location_id
     FROM picking_list_items
     WHERE picking_list_id = ? AND status = 'VALIDATED' AND confirmed_location_id IS NOT NULL`,
    [pickingListId]
  );
  return rows;
};

/**
 * Mengambil item BACKORDER atau unallocated PENDING untuk satu picking list.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} pickingListId
 * @returns {Promise<Array<any>>}
 */
export const getUnfulfillableItemsByListId = async (connection, pickingListId) => {
  const [rows] = await connection.query(
    `SELECT
       pli.id,
       pli.picking_list_id,
       pli.product_id,
       pli.price,
       pli.quantity,
       pli.original_sku,
       pl.location_purpose
     FROM picking_list_items pli
     JOIN picking_lists pl ON pli.picking_list_id = pl.id
     WHERE pli.picking_list_id = ?
       AND (pli.status = 'BACKORDER' OR (pli.status = 'PENDING' AND pli.suggested_location_id IS NULL))
       AND pl.status IN ('PENDING', 'VALIDATED')
       AND pl.is_active = 1`,
    [pickingListId]
  );
  return rows;
};

/**
 * Memperbarui alokasi kuantitas, lokasi, dan status item picking.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemId
 * @param {number} quantity
 * @param {number|string|null} locationId
 * @param {string} [status='PENDING']
 * @returns {Promise<any>}
 */
export const updateItemAllocation = async (connection, itemId, quantity, locationId, status = "PENDING") => {
  return connection.query(
    "UPDATE picking_list_items SET quantity = ?, suggested_location_id = ?, status = ? WHERE id = ?",
    [quantity, locationId, status, itemId]
  );
};

/**
 * Menyisipkan single picking item baru (misal saat split allocation).
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} data
 * @returns {Promise<any>}
 */
export const insertPickingItem = async (connection, { pickingListId, productId, originalSku, price = 0, quantity, status = "PENDING", suggestedLocationId = null }) => {
  return connection.query(
    `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, price, quantity, status, suggested_location_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [pickingListId, productId, originalSku, price, quantity, status, suggestedLocationId]
  );
};

/**
 * Mengambil semua item pending & backorder dari sekumpulan picking lists.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Array<number|string>} pickingListIds
 * @returns {Promise<Array<any>>}
 */
export const getPendingAndBackorderItemsByListIds = async (connection, pickingListIds) => {
  if (!pickingListIds || pickingListIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT
       pli.id,
       pli.product_id,
       pli.quantity,
       pli.original_sku,
       pli.status,
       pli.suggested_location_id,
       pl.location_purpose
     FROM picking_list_items pli
     JOIN picking_lists pl ON pli.picking_list_id = pl.id
     WHERE pli.picking_list_id IN (?)
       AND pli.status IN ('PENDING', 'BACKORDER')
       AND pl.status IN ('PENDING', 'VALIDATED')
       AND pl.is_active = 1`,
    [pickingListIds]
  );
  return rows;
};

/**
 * Mengambil SKU dari item yang unfulfillable untuk anti-parsial check.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} listId
 * @returns {Promise<Array<{ original_sku: string }>>}
 */
export const getUnfulfillableSkusByListId = async (connection, listId) => {
  const [rows] = await connection.query(
    `SELECT original_sku FROM picking_list_items
     WHERE picking_list_id = ?
       AND (status = 'BACKORDER' OR (status = 'PENDING' AND suggested_location_id IS NULL))`,
    [listId]
  );
  return rows;
};

/**
 * Menghapus seluruh item dari suatu picking list.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} pickingListId
 * @returns {Promise<any>}
 */
export const deleteItemsByPickingListId = async (connection, pickingListId) => {
  return connection.query("DELETE FROM picking_list_items WHERE picking_list_id = ?", [pickingListId]);
};

/**
 * Mengambil item RETURNED dengan row lock (FOR UPDATE) untuk validasi return.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} itemId
 * @returns {Promise<{ product_id: number, quantity: number }|null>}
 */
export const getReturnedItemForValidation = async (connection, itemId) => {
  const [rows] = await connection.query(
    "SELECT product_id, quantity FROM picking_list_items WHERE id = ? AND status = 'RETURNED' FOR UPDATE",
    [itemId]
  );
  return rows.length > 0 ? rows[0] : null;
};
