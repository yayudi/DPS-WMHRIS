// backend\repositories\stockMovementRepository.js
import { buildTriStateWhere } from "../utils/sqlUtils.js";

const BATCH_LOG_SELECT = `
  sm.id,
  p.sku,
  p.name as product_name,
  sm.quantity,
  sm.movement_type,
  sm.notes,
  sm.created_at,
  u.username as user,
  from_loc.code as from_location,
  to_loc.code as to_location
`;

const BATCH_LOG_FROM = `
  FROM stock_movements sm
  JOIN products p ON sm.product_id = p.id
  JOIN users u ON sm.user_id = u.id
  LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
  LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
`;

/**
 * Membangun klausul WHERE dan parameter untuk riwayat pergerakan stok per produk.
 * @param {Object} filters
 * @param {number|string} filters.productId
 * @param {string|null} [filters.movementType]
 * @param {string|null} [filters.startDate]
 * @param {string|null} [filters.endDate]
 * @param {number|string|null} [filters.locationId]
 * @param {string|null} [filters.user]
 * @returns {{ whereClause: string, params: Array<string|number> }}
 */
const buildStockHistoryWhere = ({
  productId,
  movementType = null,
  startDate = null,
  endDate = null,
  locationId = null,
  user = null,
}) => {
  const conditions = ["sm.product_id = ?"];
  const params = [productId];

  if (movementType && movementType !== "all") {
    conditions.push("sm.movement_type = ?");
    params.push(movementType);
  }

  if (startDate && endDate) {
    conditions.push("DATE(sm.created_at) BETWEEN ? AND ?");
    params.push(startDate, endDate);
  } else if (startDate) {
    conditions.push("DATE(sm.created_at) >= ?");
    params.push(startDate);
  } else if (endDate) {
    conditions.push("DATE(sm.created_at) <= ?");
    params.push(endDate);
  }

  if (locationId && locationId !== "all") {
    conditions.push("(sm.from_location_id = ? OR sm.to_location_id = ?)");
    params.push(locationId, locationId);
  }

  if (user) {
    conditions.push("u.username LIKE ?");
    params.push(`%${user}%`);
  }

  return { whereClause: conditions.join(" AND "), params };
};

/**
 * Membangun klausul WHERE dan parameter untuk query log batch movement.
 * @param {Object} filters
 * @param {string} filters.startDate
 * @param {string} filters.endDate
 * @param {string} [filters.productName]
 * @param {any} [filters.movementType]
 * @param {any} [filters.sourceLocation]
 * @param {any} [filters.destinationLocation]
 * @param {string} [filters.userId]
 * @param {string} [filters.notes]
 * @returns {{ whereClause: string, params: Array<any> }}
 */
const buildBatchLogWhere = ({
  startDate,
  endDate,
  productName,
  movementType,
  sourceLocation,
  destinationLocation,
  userId,
  notes,
}) => {
  const conditions = ["sm.created_at BETWEEN ? AND ?"];
  const params = [startDate, `${endDate} 23:59:59`];

  if (productName) {
    conditions.push("(p.name LIKE ? OR p.sku LIKE ?)");
    params.push(`%${productName}%`, `%${productName}%`);
  }

  const triStateFilters = [
    { column: "sm.movement_type", value: movementType },
    { column: "sm.from_location_id", value: sourceLocation },
    { column: "sm.to_location_id", value: destinationLocation },
  ];

  for (const { column, value } of triStateFilters) {
    const clauses = buildTriStateWhere(column, value, params);
    if (clauses.length > 0) {
      conditions.push(`(${clauses.join(" AND ")})`);
    }
  }

  if (userId) {
    conditions.push("u.username LIKE ?");
    params.push(`%${userId}%`);
  }

  if (notes) {
    conditions.push("sm.notes LIKE ?");
    params.push(`%${notes}%`);
  }

  return { whereClause: conditions.join(" AND "), params };
};

/**
 * Mencatat pergerakan stok (Log Only)
 * @param {Object} connection - Koneksi database (Transaction active)
 * @param {Object} data - { productId, quantity, fromLocationId, toLocationId, type, userId, notes }
 */
export const createLog = async (
  connection,
  { productId, quantity, fromLocationId = null, toLocationId = null, type, userId, notes }
) => {
  return connection.query(
    `INSERT INTO stock_movements
     (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, quantity, fromLocationId, toLocationId, type, userId, notes, new Date()]
  );
};

/**
 * Mengambil daftar unik movement_type
 * @param {Object} connection - Koneksi database
 * @returns {Promise<Array>} Array of movement types
 */
export const getMovementTypes = async (connection) => {
  const [rows] = await connection.query(
    `SELECT DISTINCT movement_type FROM stock_movements WHERE movement_type IS NOT NULL ORDER BY movement_type ASC`
  );
  return rows.map((r) => r.movement_type);
};

/**
 * Mengambil riwayat pergerakan stok per produk beserta total baris untuk paginasi.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} filters
 * @param {number|string} filters.productId
 * @param {string|null} [filters.movementType]
 * @param {string|null} [filters.startDate]
 * @param {string|null} [filters.endDate]
 * @param {number|string|null} [filters.locationId]
 * @param {string|null} [filters.user]
 * @param {number} [filters.limit=15]
 * @param {number} [filters.offset=0]
 * @returns {Promise<{ rows: Array<Object>, total: number }>}
 */
export const getStockHistory = async (
  connection,
  {
    productId,
    movementType = null,
    startDate = null,
    endDate = null,
    locationId = null,
    user = null,
    limit = 15,
    offset = 0,
  },
) => {
  const { whereClause, params } = buildStockHistoryWhere({
    productId,
    movementType,
    startDate,
    endDate,
    locationId,
    user,
  });

  const countQuery = `
    SELECT COUNT(*) as total
    FROM stock_movements sm
    JOIN users u ON sm.user_id = u.id
    WHERE ${whereClause}
  `;

  const historyQuery = `
    SELECT
      sm.id,
      sm.quantity,
      sm.movement_type,
      sm.notes,
      sm.created_at,
      u.username as user,
      from_loc.code as from_location,
      to_loc.code as to_location
    FROM stock_movements sm
    JOIN users u ON sm.user_id = u.id
    LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
    LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
    WHERE ${whereClause}
    ORDER BY sm.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [totalRows] = await connection.query(countQuery, params);
  const [rows] = await connection.query(historyQuery, [...params, limit, offset]);

  return {
    rows,
    total: Number(totalRows[0]?.total || 0),
  };
};

/**
 * Mengambil log pergerakan stok batch terfilter beserta total baris untuk paginasi.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} filters
 * @param {string} filters.startDate
 * @param {string} filters.endDate
 * @param {string} [filters.productName]
 * @param {any} [filters.movementType]
 * @param {any} [filters.sourceLocation]
 * @param {any} [filters.destinationLocation]
 * @param {string} [filters.userId]
 * @param {string} [filters.notes]
 * @param {number} [filters.limit=50]
 * @param {number} [filters.offset=0]
 * @returns {Promise<{ rows: Array<Object>, total: number }>}
 */
export const getBatchLogs = async (
  connection,
  {
    startDate,
    endDate,
    productName,
    movementType,
    sourceLocation,
    destinationLocation,
    userId,
    notes,
    limit = 50,
    offset = 0,
  },
) => {
  const { whereClause, params } = buildBatchLogWhere({
    startDate,
    endDate,
    productName,
    movementType,
    sourceLocation,
    destinationLocation,
    userId,
    notes,
  });

  const countQuery = `SELECT COUNT(*) as total ${BATCH_LOG_FROM} WHERE ${whereClause}`;
  const dataQuery = `
    SELECT ${BATCH_LOG_SELECT}
    ${BATCH_LOG_FROM}
    WHERE ${whereClause}
    ORDER BY sm.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [totalRows] = await connection.query(countQuery, params);
  const [rows] = await connection.query(dataQuery, [...params, limit, offset]);

  return {
    rows,
    total: Number(totalRows[0]?.total || 0),
  };
};
