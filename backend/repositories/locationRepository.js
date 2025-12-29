// backend/repositories/locationRepository.js
// ============================================================================
// READ OPERATIONS
// ============================================================================

export const getIdByCode = async (connection, code) => {
  const [rows] = await connection.query("SELECT id FROM locations WHERE code = ?", [code]);
  return rows.length > 0 ? rows[0].id : null;
};

export const getAllLocationCodes = async (connection) => {
  const [rows] = await connection.query(
    "SELECT DISTINCT code FROM locations WHERE code IS NOT NULL AND code != '' ORDER BY code ASC"
  );
  return rows.map((r) => r.code);
};

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
      -- Custom Priority: 2 & 3 Paling Atas, lalu 4 & 5
      CASE
        WHEN sl.location_id IN (2, 3) THEN 1
        WHEN sl.location_id IN (4, 5) THEN 2
        ELSE 3
      END ASC,
      -- Secondary: Jika prioritas sama, ambil stok terbanyak (DESC) agar picking lebih aman
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
export const findBestStock = async (connection, productId, qtyNeeded) => {
  const [rows] = await connection.query(
    `SELECT sl.location_id, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id = ?
        AND sl.quantity > 0
        AND l.purpose = 'DISPLAY'
      ORDER BY
        -- Custom Priority Level
        CASE
          WHEN sl.location_id IN (2, 3) THEN 1
          WHEN sl.location_id IN (4, 5) THEN 2
          ELSE 3
        END ASC,
        -- Prioritaskan stok yang CUKUP dulu dalam level prioritas yang sama
        CASE WHEN sl.quantity >= ? THEN 1 ELSE 2 END ASC,
        -- Terakhir ambil stok terbanyak
        sl.quantity DESC
      LIMIT 1`,
    [productId, qtyNeeded, qtyNeeded]
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

export const deductStock = async (connection, productId, locationId, quantity) => {
  return connection.query(
    `UPDATE stock_locations
      SET quantity = quantity - ?
      WHERE product_id = ? AND location_id = ?`,
    [quantity, productId, locationId]
  );
};

export const incrementStock = async (connection, productId, locationId, quantity) => {
  return connection.query(
    `INSERT INTO stock_locations (product_id, location_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
    [productId, locationId, quantity, quantity]
  );
};
