import { normalizePagination, formatPaginationMeta } from "../utils/paginationUtils.js";
import { STOCK_REQUEST_STATUS, STOCK_REQUEST_TYPE } from "../config/wmsConstants.js";

/**
 * @typedef {Object} StockRequestPayload
 * @property {number} requesterId
 * @property {number} [fromLocationId]
 * @property {number} [toLocationId]
 * @property {string} notes
 * @property {string} [type]
 * @property {Array<{productId: number, quantity: number}>} items
 */

/**
 * Membuat permintaan stok baru beserta item-itemnya.
 * @param {import('mysql2/promise').Connection} connection
 * @param {StockRequestPayload} payload
 * @returns {Promise<number>} ID dari stock_request yang dibuat
 */
export const createStockRequest = async (connection, payload) => {
  const {
    requesterId,
    fromLocationId,
    toLocationId,
    notes,
    items,
    type = STOCK_REQUEST_TYPE.TRANSFER,
    status = STOCK_REQUEST_STATUS.PENDING
  } = payload;

  // Generate request_number (contoh SR-YYMMDD-XXXX)
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const randStr = Math.floor(1000 + Math.random() * 9000);
  const requestNumber = `SR-${dateStr}-${randStr}`;

  const [result] = await connection.execute(
    `INSERT INTO stock_requests
    (request_number, type, requester_id, from_location_id, to_location_id, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [requestNumber, type, requesterId, fromLocationId || null, toLocationId || null, status, notes || null],
  );

  const stockRequestId = result.insertId;

  if (items && items.length > 0) {
    const itemValues = items.map((item) => [
      stockRequestId,
      item.productId,
      item.quantity,
      0, // received_quantity awal 0
    ]);

    await connection.query(
      `INSERT INTO stock_request_items
      (stock_request_id, product_id, quantity, received_quantity)
      VALUES ?`,
      [itemValues],
    );
  }

  return stockRequestId;
};

/**
 * Mengambil daftar permintaan stok beserta informasinya
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
export const getStockRequests = async (connection, filters = {}) => {
  let baseQuery = `FROM stock_requests sr
    LEFT JOIN users u ON sr.requester_id = u.id
    LEFT JOIN locations l1 ON sr.from_location_id = l1.id
    LEFT JOIN locations l2 ON sr.to_location_id = l2.id
    WHERE 1=1`;
    
  let query = `
    SELECT sr.*,
           u.username as requester_name,
           l1.name as from_location_name, l1.code as from_location_code,
           l2.name as to_location_name, l2.code as to_location_code
  `;
  const queryParams = [];

  if (filters.status) {
    baseQuery += ` AND sr.status = ?`;
    queryParams.push(filters.status);
  }

  if (filters.fromLocationId) {
    baseQuery += ` AND sr.from_location_id = ?`;
    queryParams.push(filters.fromLocationId);
  }

  if (filters.toLocationId) {
    baseQuery += ` AND sr.to_location_id = ?`;
    queryParams.push(filters.toLocationId);
  }

  // Count total records before applying limit/offset
  const [countResult] = await connection.execute(`SELECT COUNT(*) as total ${baseQuery}`, queryParams);
  const total = countResult[0].total;

  baseQuery += ` ORDER BY sr.created_at DESC`;

  // Apply pagination
  const { page, limit, offset } = normalizePagination(filters, 50);

  baseQuery += ` LIMIT ? OFFSET ?`;
  queryParams.push(limit, offset);
  
  query += baseQuery;

  const [rows] = await connection.execute(query, queryParams);

  if (rows.length === 0) return rows;

  // Fetch all items for the retrieved requests
  const requestIds = rows.map((r) => r.id);
  const [items] = await connection.query(
    `SELECT sri.*, p.name as product_name, p.sku
     FROM stock_request_items sri
     JOIN products p ON sri.product_id = p.id
     WHERE sri.stock_request_id IN (?)`,
    [requestIds],
  );

  // Group items by stock_request_id
  const itemsByRequestId = {};
  for (const item of items) {
    if (!itemsByRequestId[item.stock_request_id]) {
      itemsByRequestId[item.stock_request_id] = [];
    }
    itemsByRequestId[item.stock_request_id].push(item);
  }

  // Attach items to rows
  for (const row of rows) {
    row.items = itemsByRequestId[row.id] || [];
  }

  return {
    data: rows,
    pagination: formatPaginationMeta(total, page, limit),
  };
};

/**
 * Mengambil detail permintaan stok beserta item-itemnya
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export const getStockRequestById = async (connection, id) => {
  const [rows] = await connection.execute(
    `SELECT sr.*,
        u.username as requester_name,
        l1.name as from_location_name, l1.code as from_location_code,
        l2.name as to_location_name, l2.code as to_location_code
      FROM stock_requests sr
      LEFT JOIN users u ON sr.requester_id = u.id
      LEFT JOIN locations l1 ON sr.from_location_id = l1.id
      LEFT JOIN locations l2 ON sr.to_location_id = l2.id
      WHERE sr.id = ?`,
    [id],
  );

  if (rows.length === 0) return null;
  const requestData = rows[0];

  const [items] = await connection.execute(
    `SELECT sri.*, p.name as product_name, p.sku
      FROM stock_request_items sri
      JOIN products p ON sri.product_id = p.id
      WHERE sri.stock_request_id = ?`,
    [id],
  );

  requestData.items = items;
  return requestData;
};

/**
 * Mengubah status permintaan stok
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} id
 * @param {string} status 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'
 * @returns {Promise<boolean>}
 */
export const updateStockRequestStatus = async (connection, id, status) => {
  const [result] = await connection.execute(
    `UPDATE stock_requests SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id],
  );
  return result.affectedRows > 0;
};

/**
 * Mengubah jumlah yang diterima (received_quantity) untuk suatu item permintaan
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} itemId
 * @param {number} receivedQuantity
 * @returns {Promise<boolean>}
 */
export const updateRequestItemReceived = async (connection, itemId, receivedQuantity) => {
  const [result] = await connection.execute(
    `UPDATE stock_request_items SET received_quantity = ? WHERE id = ?`,
    [receivedQuantity, itemId],
  );
  return result.affectedRows > 0;
};
