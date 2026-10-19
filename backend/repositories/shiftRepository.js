import db from '../config/db.js';

/**
 * Get all shifts
 * @param {import('mysql2/promise').Connection} [connection]
 * @returns {Promise<Array>}
 */
export const getAllShifts = async (connection) => {
  const conn = connection || db;
  const [rows] = await conn.query('SELECT * FROM shifts ORDER BY name ASC');
  return rows;
};

/**
 * Get shift by ID
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
export const getShiftById = async (id) => {
  const [rows] = await db.query('SELECT * FROM shifts WHERE id = ?', [id]);
  return rows[0] || null;
};

/**
 * Create new shift
 * @param {Object} data
 * @returns {Promise<number>} Inserted ID
 */
export const createShift = async (data) => {
  const { name, start_time, end_time, work_days, flexible_minutes, is_default } = data;
  const [result] = await db.query(
    'INSERT INTO shifts (name, start_time, end_time, work_days, flexible_minutes, is_default) VALUES (?, ?, ?, ?, ?, ?)',
    [name, start_time, end_time, work_days, flexible_minutes, is_default]
  );
  return result.insertId;
};

/**
 * Update shift
 * @param {number} id
 * @param {Object} data
 * @returns {Promise<number>} Affected Rows
 */
export const updateShift = async (id, data) => {
  const { name, start_time, end_time, work_days, flexible_minutes, is_default } = data;
  const [result] = await db.query(
    'UPDATE shifts SET name = ?, start_time = ?, end_time = ?, work_days = ?, flexible_minutes = ?, is_default = ? WHERE id = ?',
    [name, start_time, end_time, work_days, flexible_minutes, is_default, id]
  );
  return result.affectedRows;
};

/**
 * Delete shift
 * @param {number} id
 * @returns {Promise<number>} Affected Rows
 */
export const deleteShift = async (id) => {
  const [result] = await db.query('DELETE FROM shifts WHERE id = ?', [id]);
  return result.affectedRows;
};

/**
 * Get default shift (fallback)
 * @returns {Promise<Object>}
 */
export const getDefaultShift = async () => {
  const [rows] = await db.query('SELECT * FROM shifts WHERE is_default = 1 LIMIT 1');
  return rows[0] || null;
};

/**
 * Get shift for specific user, fallback to default if not assigned.
 * @param {string} usernameOrId
 * @returns {Promise<Object>}
 */
export const getUserShift = async (username) => {
  // Priority: User's assigned shift > Default shift
  const query = `
        SELECT s.*
        FROM users u
        LEFT JOIN shifts s ON u.shift_id = s.id
        WHERE u.username = ?
    `;
  const [rows] = await db.query(query, [username]);

  if (rows.length > 0 && rows[0].id) {
    return rows[0];
  }
  return await getDefaultShift();
};

/**
 * Get User ID by Username
 * @param {string} username
 * @returns {Promise<number|null>}
 */
export const getUserIdByUsername = async (username) => {
  const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
  return rows[0]?.id || null;
};
