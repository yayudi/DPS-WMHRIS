// backend/repositories/locationRepository.js
// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {any} code
 * @returns {Promise<any>}
 */
export const getIdByCode = async (connection, code) => {
  const [rows] = await connection.query("SELECT id FROM locations WHERE code = ?", [code]);
  return rows.length > 0 ? rows[0].id : null;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
export const getAllLocationCodes = async (connection) => {
  const [rows] = await connection.query(
    "SELECT DISTINCT code FROM locations WHERE code IS NOT NULL AND code != '' ORDER BY code ASC"
  );
  return rows.map((r) => r.code);
};

/**
 * Mengambil daftar kode lokasi dengan memfilter berdasarkan parameter (misal: building, purpose)
 * agar kolom Pivot hanya menampilkan lokasi yang relevan.
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} filters
 * @returns {Promise<string[]>}
 */
export const getFilteredLocationCodes = async (connection, filters) => {
  const whereClauses = ["code IS NOT NULL", "code != ''"];
  const queryParams = [];

  // Filter Building
  if (filters && filters.building) {
    if (Array.isArray(filters.building)) {
      if (filters.building.length > 0) {
        whereClauses.push("building IN (?)");
        queryParams.push(filters.building);
      }
    } else if (typeof filters.building === "object") {
      if (filters.building.include && filters.building.include.length > 0) {
        whereClauses.push("building IN (?)");
        queryParams.push(filters.building.include);
      }
      if (filters.building.exclude && filters.building.exclude.length > 0) {
        whereClauses.push("building NOT IN (?)");
        queryParams.push(filters.building.exclude);
      }
    } else if (filters.building !== "all" && filters.building !== "") {
      whereClauses.push("building = ?");
      queryParams.push(filters.building);
    }
  }

  // Filter Purpose
  if (filters && filters.purpose) {
    if (Array.isArray(filters.purpose)) {
      if (filters.purpose.length > 0) {
        whereClauses.push("purpose IN (?)");
        queryParams.push(filters.purpose);
      }
    } else if (typeof filters.purpose === "object") {
      if (filters.purpose.include && filters.purpose.include.length > 0) {
        whereClauses.push("purpose IN (?)");
        queryParams.push(filters.purpose.include);
      }
      if (filters.purpose.exclude && filters.purpose.exclude.length > 0) {
        whereClauses.push("purpose NOT IN (?)");
        queryParams.push(filters.purpose.exclude);
      }
    } else if (filters.purpose !== "all" && filters.purpose !== "") {
      whereClauses.push("purpose = ?");
      queryParams.push(filters.purpose);
    }
  }

  const query = `SELECT DISTINCT code FROM locations WHERE ${whereClauses.join(" AND ")} ORDER BY code ASC`;
  const [rows] = await connection.query(query, queryParams);
  return rows.map((r) => r.code);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
export const getLocationMap = async (connection) => {
  const [rows] = await connection.query("SELECT id, code FROM locations");
  const map = new Map();
  rows.forEach((r) => {
    if (r.code) map.set(r.code, r.id);
  });
  return map;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
export const getAllLocations = async (connection) => {
  const [locations] = await connection.query(
    "SELECT id, code, building, floor, name, purpose FROM locations ORDER BY id ASC"
  );
  return locations;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} locationId
 * @returns {Promise<any>}
 */
export const getStockSample = async (connection, locationId) => {
  const query = `
    SELECT p.sku, p.name, sl.quantity
    FROM stock_locations sl
    JOIN products p ON sl.product_id = p.id
    WHERE sl.location_id = ? AND sl.quantity > 0
    LIMIT 10
  `;
  const [results] = await connection.query(query, [locationId]);
  return results;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} productId
 * @param {number|string} locationId
 * @param {any} forUpdate
 * @returns {Promise<any>}
 */
export const getStockAtLocation = async (connection, productId, locationId, forUpdate = false) => {
  let query = "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ?";
  if (forUpdate) query += " FOR UPDATE";
  const [rows] = await connection.query(query, [productId, locationId]);
  return rows.length > 0 ? Number(rows[0].quantity) : 0;
};

/**
 * Bulk Get Locations (Strict Purpose)
 */
export const getLocationsByProductIds = async (connection, productIds, purpose = "DISPLAY") => {
  if (!productIds || productIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT sl.product_id, sl.location_id, l.code, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id IN (?) AND l.purpose = ?
      ORDER BY
      CASE
        WHEN sl.location_id IN (2, 3) THEN 1
        WHEN sl.location_id IN (4, 5) THEN 2
        ELSE 3
      END ASC,
      sl.quantity DESC`,
    [productIds, purpose]
  );
  return rows;
};

/**
 * Bulk Get Total Stock (Strict Purpose)
 */
export const getTotalStockByProductIds = async (connection, productIds, purpose = "DISPLAY") => {
  if (!productIds || productIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT sl.product_id, SUM(sl.quantity) as qty
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE l.purpose = ? AND sl.product_id IN (?)
      GROUP BY sl.product_id`,
    [purpose, productIds]
  );
  return rows;
};

/**
 * Find Best Stock (Single Lookup)
 */
export const findBestStock = async (connection, productId, qtyNeeded, purpose = "DISPLAY") => {
  const [rows] = await connection.query(
    `SELECT sl.location_id, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id = ?
        AND sl.quantity > 0
        AND l.purpose = ?
      ORDER BY
        CASE
          WHEN l.purpose = 'DISPLAY' AND sl.location_id IN (2, 3)
            THEN 1
          WHEN l.purpose = 'DISPLAY' AND sl.location_id IN (4, 5)
            THEN 2
          ELSE 3
        END ASC,
        CASE WHEN sl.quantity >= ? THEN 1 ELSE 2 END ASC,
        sl.quantity DESC
      LIMIT 1`,
    [productId, purpose, qtyNeeded, qtyNeeded]
  );
  return rows.length > 0 ? rows[0].location_id : null;
};

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Mengatur jumlah stok secara absolut (untuk Stock Opname)
 * Jika record belum ada -> Insert
 * Jika record ada -> Update quantity = newQty
 */
export const upsertStock = async (connection, productId, locationId, newQty) => {
  const query = `
    INSERT INTO stock_locations (product_id, location_id, quantity, updated_at)
    VALUES (?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE quantity = ?, updated_at = NOW()
  `;
  return connection.query(query, [productId, locationId, newQty, newQty]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} productId
 * @param {number|string} locationId
 * @param {any} quantity
 * @returns {Promise<any>}
 */
export const deductStock = async (connection, productId, locationId, quantity) => {
  return connection.query(
    `UPDATE stock_locations
      SET quantity = quantity - ?
      WHERE product_id = ? AND location_id = ?`,
    [quantity, productId, locationId]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} productId
 * @param {number|string} locationId
 * @param {any} quantity
 * @returns {Promise<any>}
 */
export const incrementStock = async (connection, productId, locationId, quantity) => {
  return connection.query(
    `INSERT INTO stock_locations (product_id, location_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
    [productId, locationId, quantity, quantity]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const createLocation = async (connection, { code, building, floor, name, purpose }) => {
  const [result] = await connection.query(
    `INSERT INTO locations (code, building, floor, name, purpose)
      VALUES (?, ?, ?, ?, ?)`,
    [code, building, floor || null, name || null, purpose]
  );
  return result.insertId;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const updateLocation = async (connection, id, { code, building, floor, name, purpose }) => {
  const [result] = await connection.query(
    "UPDATE locations SET code = ?, building = ?, floor = ?, name = ?, purpose = ? WHERE id = ?",
    [code, building, floor || null, name || null, purpose, id]
  );
  return result.affectedRows > 0;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export const deleteLocation = async (connection, id) => {
  const [result] = await connection.query("DELETE FROM locations WHERE id = ?", [id]);
  return result.affectedRows > 0;
};

/**
 * Pre-fetch and lock all stock locations with purpose for given products (FOR UPDATE)
 * @param {import('mysql2/promise').Connection} connection
 * @param {number[]} productIds
 * @returns {Promise<Array<{ product_id: number, location_id: number, quantity: number, purpose: string }>>}
 */
export const getStockLocationsForUpdate = async (connection, productIds) => {
  if (!productIds || productIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT sl.product_id, sl.location_id, sl.quantity, l.purpose
     FROM stock_locations sl
     JOIN locations l ON sl.location_id = l.id
     WHERE sl.product_id IN (?)
     FOR UPDATE`,
    [productIds]
  );
  return rows;
};

/**
 * Lock stock locations for given products (FOR UPDATE)
 * @param {import('mysql2/promise').Connection} connection
 * @param {number[]} productIds
 * @returns {Promise<Array<{ product_id: number, location_id: number, quantity: number }>>}
 */
export const getSimpleStockLocationsForUpdate = async (connection, productIds) => {
  if (!productIds || productIds.length === 0) return [];
  const [rows] = await connection.query(
    `SELECT product_id, location_id, quantity
     FROM stock_locations
     WHERE product_id IN (?)
     FOR UPDATE`,
    [productIds]
  );
  return rows;
};

