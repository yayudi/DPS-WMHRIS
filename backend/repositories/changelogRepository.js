/**
 * Mengambil semua catatan changelog, diurutkan dari yang terbaru.
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<Array>}
 */
export const getChangelogs = async (connection) => {
  const [rows] = await connection.query(
    "SELECT * FROM system_changelogs ORDER BY release_date DESC, id DESC"
  );
  return rows;
};
