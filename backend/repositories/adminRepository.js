// backend/repositories/adminRepository.js

/**
 * Mengambil semua user aktif beserta role dan shift name.
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<Array>}
 */
export const findAllActiveUsers = async (connection) => {
  const query = `
    SELECT u.id, u.username, u.nickname, u.role_id, r.name AS role_name,
           u.shift_id, s.name AS shift_name, u.exclude_from_attendance
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN shifts s ON u.shift_id = s.id
    WHERE u.is_active = 1
    ORDER BY u.username ASC
  `;
  const [rows] = await connection.query(query);
  return rows;
};

/**
 * Mengambil data user berdasarkan ID.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
export const findUserById = async (connection, userId) => {
  const [rows] = await connection.query(
    "SELECT id, username, nickname, role_id, shift_id, exclude_from_attendance FROM users WHERE id = ?",
    [userId]
  );
  return rows[0] || null;
};

/**
 * Insert user baru ke tabel users.
 * @param {import('mysql2/promise').Connection} connection
 * @param {object} data
 * @param {string} data.username
 * @param {string} data.passwordHash
 * @param {number} data.roleId
 * @param {string|null} data.nickname
 * @param {number|null} data.shiftId
 * @param {number} data.excludeFromAttendance
 * @returns {Promise<number>} insertId
 */
export const insertUser = async (connection, { username, passwordHash, roleId, nickname, shiftId, excludeFromAttendance }) => {
  const [result] = await connection.query(
    `INSERT INTO users (username, password_hash, role_id, nickname, shift_id, exclude_from_attendance)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username, passwordHash, roleId, nickname, shiftId, excludeFromAttendance]
  );
  return result.insertId;
};

/**
 * Mengambil semua role.
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<Array>}
 */
export const findAllRoles = async (connection) => {
  const [rows] = await connection.query("SELECT id, name FROM roles ORDER BY name ASC");
  return rows;
};

/**
 * Update user berdasarkan ID secara dinamis.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} userId
 * @param {string[]} fields - Array SQL fragments, e.g. ["username = ?", "role_id = ?"]
 * @param {Array} values - Corresponding values for each fragment
 * @returns {Promise<number>} affectedRows
 */
export const updateUserById = async (connection, userId, fields, values) => {
  const query = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;
  const [result] = await connection.query(query, [...values, userId]);
  return result.affectedRows;
};

/**
 * Soft delete user (set is_active = 0).
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} userId
 * @returns {Promise<number>} affectedRows
 */
export const softDeleteUser = async (connection, userId) => {
  const [result] = await connection.query("UPDATE users SET is_active = 0 WHERE id = ?", [userId]);
  return result.affectedRows;
};

/**
 * Mengambil semua location_id untuk user tertentu.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} userId
 * @returns {Promise<number[]>}
 */
export const findUserLocationIds = async (connection, userId) => {
  const [rows] = await connection.query("SELECT location_id FROM user_locations WHERE user_id = ?", [userId]);
  return rows.map((row) => row.location_id);
};

/**
 * Hapus semua lokasi user, lalu insert ulang.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} userId
 * @param {number[]} locationIds
 */
export const replaceUserLocations = async (connection, userId, locationIds) => {
  await connection.query("DELETE FROM user_locations WHERE user_id = ?", [userId]);

  if (locationIds.length > 0) {
    const values = locationIds.map((locationId) => [userId, locationId]);
    await connection.query("INSERT INTO user_locations (user_id, location_id) VALUES ?", [values]);
  }
};
