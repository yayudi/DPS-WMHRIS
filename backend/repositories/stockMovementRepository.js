// backend\repositories\stockMovementRepository.js

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
