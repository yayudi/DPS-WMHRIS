import db from '../config/db.js';

/**
 * Repository for Attendance Data.
 * Handles direct DB interaction for attendance_logs and related tables.
 */

/**
 * Find attendance logs within a date range.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string} [search] - Optional search query (username or nickname)
 * @returns {Promise<Array>} List of attendance logs
 */
export const findLogsByDateRange = async (startDate, endDate, search = null) => {
  let query = `
        SELECT
            al.id,
            al.username,
            u.nickname,
            al.date,
            al.check_in,
            al.check_out,
            al.lateness_minutes,
            al.overtime_minutes,
            al.notes
        FROM attendance_logs al
        LEFT JOIN users u ON al.username = u.username
        WHERE al.date BETWEEN ? AND ?
    `;

  const params = [startDate, endDate];

  if (search) {
    query += ` AND (al.username LIKE ? OR u.nickname LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY al.date DESC, al.check_in ASC`;

  const [rows] = await db.query(query, params);
  return rows;
};

/**
 * Get summary stats for a specific date range.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {Promise<Object>} Summary counts
 */
export const getStatsByDateRange = async (startDate, endDate) => {
  const query = `
        SELECT
            COUNT(*) as total_logs,
            SUM(CASE WHEN lateness_minutes > 0 THEN 1 ELSE 0 END) as total_late,
            SUM(CASE WHEN overtime_minutes > 0 THEN 1 ELSE 0 END) as total_overtime
        FROM attendance_logs
        WHERE date BETWEEN ? AND ?
    `;

  const [rows] = await db.query(query, [startDate, endDate]);
  return rows[0];
};

/**
 * Upsert attendance log.
 * @param {string} username
 * @param {string} date - YYYY-MM-DD
 * @param {Object} data - { check_in, check_out, notes, lateness_minutes, overtime_minutes }
 */
export const upsertLog = async (username, date, data) => {
  // Check if exists
  const [existing] = await db.query(
    'SELECT id FROM attendance_logs WHERE username = ? AND date = ?',
    [username, date]
  );

  if (existing.length > 0) {
    // Update
    const query = `
      UPDATE attendance_logs
      SET check_in = ?, check_out = ?, notes = ?, lateness_minutes = ?, overtime_minutes = ?, status = ?
      WHERE id = ?
    `;
    await db.query(query, [
      data.check_in,
      data.check_out,
      data.notes,
      data.lateness_minutes,
      data.overtime_minutes,
      data.status, // New column
      existing[0].id
    ]);
    return { id: existing[0].id, action: 'UPDATE' };
  } else {
    // Insert
    const query = `
      INSERT INTO attendance_logs (username, date, check_in, check_out, notes, lateness_minutes, overtime_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(query, [
      username,
      date,
      data.check_in,
      data.check_out,
      data.notes,
      data.lateness_minutes,
      data.overtime_minutes,
      data.status // New column
    ]);
    return { id: result.insertId, action: 'INSERT' };
  }
};

/**
 * Mengambil daftar hari libur berdasarkan tahun
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} year
 * @returns {Promise<Array<{date: string, name: string}>>}
 */
export const findHolidaysByYear = async (connection, year) => {
  const [rows] = await connection.query(
    "SELECT date, name FROM holidays WHERE YEAR(date) = ?",
    [year]
  );
  return rows;
};
