// backend/services/statsService.js
import db from "../config/db.js";

/**
 * Mengambil data KPI utama untuk dashboard statistik.
 */
export const getKpiSummary = async () => {
  let connection;
  try {
    connection = await db.getConnection();

    // Query 1: Aktivitas Hari Ini (berdasarkan pergerakan stok 'SALE')
    // Kita asumsikan 'created_at' di stock_movements adalah tanggal penyelesaian.
    const activityQuery = `
      SELECT
        COUNT(DISTINCT notes) AS listsCompletedToday,
        COALESCE(SUM(quantity), 0) AS itemsPickedToday,
        COUNT(DISTINCT user_id) AS usersActiveToday
      FROM
        stock_movements
      WHERE
        movement_type = 'SALE'
        AND DATE(created_at) = CURDATE();
    `;
    const [activityResult] = await connection.query(activityQuery);

    // Query 2: Total Nilai Inventaris (berdasarkan harga di tabel produk)
    const inventoryValueQuery = `
      SELECT
        COALESCE(SUM(sl.quantity * p.price), 0) AS totalInventoryValue
      FROM
        stock_locations sl
      JOIN
        products p ON sl.product_id = p.id
      WHERE
        p.is_active = 1 AND sl.quantity > 0;
    `;
    const [inventoryResult] = await connection.query(inventoryValueQuery);

    // Gabungkan hasil dari kedua query
    return {
      ...activityResult[0],
      ...inventoryResult[0],
    };
  } catch (error) {
    console.error("Error di getKpiSummary service:", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
