// backend\repositories\locationRepository.js

// Ambil ID berdasarkan Kode (Untuk Validasi Upload)
export const getIdByCode = async (connection, code) => {
  const [rows] = await connection.query("SELECT id FROM locations WHERE code = ?", [code]);
  return rows.length > 0 ? rows[0].id : null;
};

// Ambil semua kode lokasi (Untuk Header Report)
export const getAllLocationCodes = async (connection) => {
  const [rows] = await connection.query(
    "SELECT DISTINCT code FROM locations WHERE code IS NOT NULL AND code != '' ORDER BY code ASC"
  );
  return rows.map((r) => r.code);
};

// Update Stok (Upsert) - Digunakan saat Stock Opname
export const upsertStock = async (connection, productId, locationId, quantity) => {
  return connection.query(
    `INSERT INTO stock_locations (product_id, location_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = ?`,
    [productId, locationId, quantity, quantity]
  );
};

// Kurangi Stok (Atomic Update) - Dipakai di Picking
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

// Mencari lokasi stok terbaik (Logika Prioritas: Display -> Stok Cukup -> Stok Terbanyak)
// Menggantikan helper 'findBestLocation'
export const findBestStock = async (connection, productId, qtyNeeded) => {
  const [rows] = await connection.query(
    `SELECT sl.location_id, sl.quantity
     FROM stock_locations sl
     JOIN locations l ON sl.location_id = l.id
     WHERE sl.product_id = ?
       AND sl.quantity > 0
     ORDER BY
       CASE
         WHEN l.purpose = 'DISPLAY' THEN 1 ELSE 2
       END ASC, -- Prioritas 1: Display
       CASE
         WHEN l.floor IN (1, 2) AND sl.quantity >= ? THEN 1 -- Prioritas 2: Lantai Bawah & Cukup
         WHEN sl.quantity >= ? THEN 2                       -- Prioritas 3: Stok Cukup dimanapun
         WHEN l.floor IN (1, 2) THEN 3                      -- Prioritas 4: Lantai Bawah (Partial)
         ELSE 4                                             -- Prioritas 5: Sisanya
       END ASC,
       sl.quantity DESC -- Prioritas Tambahan: Stok terbanyak
     LIMIT 1`,
    [productId, qtyNeeded, qtyNeeded]
  );

  return rows.length > 0 ? rows[0].location_id : null;
};
