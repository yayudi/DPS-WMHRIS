import db from '../config/db.js';

/**
 * Get schedules for a user within a date range.
 * @param {number} userId
 * @param {string} startDate (YYYY-MM-DD)
 * @param {string} endDate (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export const getSchedulesByRange = async (userId, startDate, endDate) => {
  const query = `
        SELECT us.*, s.name as shift_name, s.start_time, s.end_time, s.flexible_minutes
        FROM user_schedules us
        JOIN shifts s ON us.shift_id = s.id
        WHERE us.user_id = ? AND us.date BETWEEN ? AND ?
        ORDER BY us.date ASC
    `;
  const [rows] = await db.query(query, [userId, startDate, endDate]);
  return rows;
};

/**
 * Get a single schedule for a user on a specific date.
 * @param {number} userId
 * @param {string} date (YYYY-MM-DD)
 * @returns {Promise<Object|null>}
 */
export const getScheduleByDate = async (userId, date) => {
  const query = `
        SELECT us.*, s.name as shift_name, s.start_time, s.end_time, s.flexible_minutes, s.work_days
        FROM user_schedules us
        JOIN shifts s ON us.shift_id = s.id
        WHERE us.user_id = ? AND us.date = ?
    `;
  const [rows] = await db.query(query, [userId, date]);
  return rows[0] || null;
};

/**
 * Create or Update (Upsert) a schedule.
 * @param {Object} scheduleData { userId, shiftId, date, createdBy }
 * @param {import('mysql2/promise').Connection} [connection]
 */
export const upsertSchedule = async ({ userId, shiftId, date, createdBy }, connection) => {
  const conn = connection || db;
  const query = `
        INSERT INTO user_schedules (user_id, shift_id, date, created_by)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), created_by = VALUES(created_by)
    `;
  const [result] = await conn.query(query, [userId, shiftId, date, createdBy]);
  return result;
};

/**
 * Delete a schedule.
 * @param {number} userId
 * @param {string} date
 */
export const deleteSchedule = async (userId, date) => {
  const query = `DELETE FROM user_schedules WHERE user_id = ? AND date = ?`;
  const [result] = await db.query(query, [userId, date]);
  return result;
};

/**
 * Bulk create schedules can be implemented if needed,
 * but looping upsert is simpler for now unless perf helps.
 */
