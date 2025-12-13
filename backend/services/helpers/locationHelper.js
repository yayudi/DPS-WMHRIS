// backend/helpers/locationHelper.js

export const findBestLocation = async (connection, productId, qtyNeeded) => {
  // Query ini menerjemahkan logika CASE WHEN yang Anda tulis di snippet SQL
  const [rows] = await connection.query(
    `SELECT sl.location_id, sl.quantity
      FROM stock_locations sl
      JOIN locations l ON sl.location_id = l.id
      WHERE sl.product_id = ?
        AND sl.quantity > 0
        AND l.purpose = 'DISPLAY' -- Filter wajib sesuai snippet Anda
      ORDER BY
        -- [LOGIKA PRIORITAS SESUAI SNIPPET ANDA] --
        CASE
          WHEN l.floor IN (1, 2) AND sl.quantity >= ? THEN 1 -- Prioritas Utama: Lantai 1/2 & Stok Cukup
          WHEN sl.quantity >= ? THEN 2                       -- Prioritas 2: Stok Cukup (Lantai bebas)
          WHEN l.floor IN (1, 2) THEN 3                      -- Prioritas 3: Lantai 1/2 (Stok kurang/partial)
          ELSE 4                                             -- Prioritas 4: Sisanya
        END ASC,
        sl.quantity DESC -- Jika prioritas sama, ambil stok terbanyak
      LIMIT 1`,
    [productId, qtyNeeded, qtyNeeded]
  );

  return rows.length > 0 ? rows[0].location_id : null;
};
