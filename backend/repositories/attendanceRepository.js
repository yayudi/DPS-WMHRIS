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
