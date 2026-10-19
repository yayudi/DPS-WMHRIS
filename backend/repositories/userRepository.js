// backend/repositories/userRepository.js

/**
 * Mendapatkan data user berdasarkan username.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
export const getUserByUsername = async (connection, username) => {
  const [rows] = await connection.query("SELECT * FROM users WHERE username = ?", [username]);
  return rows.length > 0 ? rows[0] : null;
};

/**
 * Mendapatkan data user berdasarkan ID.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
export const getUserById = async (connection, id) => {
  const [rows] = await connection.query("SELECT * FROM users WHERE id = ?", [id]);
  return rows.length > 0 ? rows[0] : null;
};

/**
 * Mendapatkan role dan daftar permissions untuk seorang user berdasarkan role_id-nya.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} roleId
 * @returns {Promise<{role: string, permissions: string[]}>}
 */
export const getRoleAndPermissions = async (connection, roleId) => {
  const [roleRows] = await connection.query(
    `
      SELECT r.name as role, p.name as permission
      FROM roles r
      LEFT JOIN role_permission rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE r.id = ?
    `,
    [roleId]
  );

  const permissions = roleRows.map((row) => row.permission).filter((p) => p);
  const role = roleRows[0]?.role || "user";

  return { role, permissions };
};

/**
 * Memperbarui profil pengguna (nickname dan/atau password).
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} userId
 * @param {Object} updates
 * @param {string} [updates.nickname]
 * @param {string} [updates.hashedNewPassword]
 * @returns {Promise<void>}
 */
export const updateProfile = async (connection, userId, updates) => {
  const updateFields = [];
  const updateValues = [];

  if (updates.nickname !== undefined) {
    updateFields.push("nickname = ?");
    updateValues.push(updates.nickname);
  }

  if (updates.hashedNewPassword) {
    updateFields.push("password_hash = ?");
    updateValues.push(updates.hashedNewPassword);
  }

  if (updateFields.length > 0) {
    const query = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;
    updateValues.push(userId);
    await connection.query(query, updateValues);
  }
};

/**
 * Mendapatkan lokasi gudang yang dapat diakses oleh user.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} userId
 * @returns {Promise<Array<Object>>}
 */
export const getUserLocations = async (connection, userId) => {
  const query = `
    SELECT l.id, l.code, l.building, l.floor, l.name
    FROM locations l
    JOIN user_locations ul ON l.id = ul.location_id
    WHERE ul.user_id = ?
    ORDER BY l.id ASC
  `;
  const [locations] = await connection.query(query, [userId]);
  return locations;
};

/**
 * Mendapatkan daftar ID user berdasarkan permission tertentu.
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} permissionName
 * @returns {Promise<number[]>}
 */
export const getUserIdsByPermission = async (connection, permissionName) => {
  const [rows] = await connection.query(
    `
      SELECT u.id 
      FROM users u
      JOIN role_permission rp ON u.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE p.name = ? AND u.is_active = 1
    `,
    [permissionName]
  );
  return rows.map(r => r.id);
};

/**
 * Memeriksa apakah user memiliki akses ke lokasi tertentu.
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} userId
 * @param {number|string} locationId
 * @returns {Promise<boolean>}
 */
export const hasLocationAccess = async (connection, userId, locationId) => {
  const [rows] = await connection.query(
    "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ? LIMIT 1",
    [userId, locationId]
  );
  return rows.length > 0;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<Array<{id: number, username: string}>>}
 */
export const getAllUsernames = async (connection) => {
  const [rows] = await connection.query("SELECT id, username FROM users");
  return rows;
};
