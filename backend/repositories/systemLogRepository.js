// backend/repositories/systemLogRepository.js
import db from "../config/db.js";

/**
 * Get system audit logs with pagination and filters
 * @param {object} filters
 * @returns {Promise<{data: Array, total: number}>}
 */
export const getLogs = async ({ page = 1, limit = 20, search, action, targetType, userId, startDate, endDate }) => {
  const offset = (page - 1) * limit;
  const conditions = ["1=1"];
  const params = [];

  if (search) {
    conditions.push("(target_id LIKE ? OR changes LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (action && action !== "all") {
    conditions.push("action = ?");
    params.push(action);
  }

  if (targetType && targetType !== "all") {
    conditions.push("target_type = ?");
    params.push(targetType);
  }

  if (userId && userId !== "all") {
    conditions.push("user_id = ?");
    params.push(userId);
  }

  if (startDate) {
    conditions.push("created_at >= ?");
    params.push(`${startDate} 00:00:00`);
  }

  if (endDate) {
    conditions.push("created_at <= ?");
    params.push(`${endDate} 23:59:59`);
  }

  const whereSql = conditions.join(" AND ");

  // Count Total
  const [countRows] = await db.query(`SELECT COUNT(*) as total FROM system_audit_logs WHERE ${whereSql}`, params);
  const total = countRows[0].total;

  // Get Data
  const query = `
    SELECT l.*, u.username, u.nickname
    FROM system_audit_logs l
    LEFT JOIN users u ON l.user_id = u.id
    WHERE ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `;

  // params is reused, but we need to append limit/offset
  const [rows] = await db.query(query, [...params, limit, offset]);

  return { data: rows, total };
};

/**
 * Create a new system audit log
 * @param {object} connection - DB Connection (Transactional)
 * @param {object} logData
 * @param {number} logData.userId
 * @param {string} logData.action - CREATE, UPDATE, DELETE, LOGIN, OTHER
 * @param {string} logData.targetType - USER, ROLE, PRODUCT, etc.
 * @param {string} logData.targetId - ID string
 * @param {object|string} logData.changes - JSON object or string description
 * @param {string} [logData.ip]
 * @param {string} [logData.userAgent]
 */
export const createLog = async (connection, { userId, action, targetType, targetId, changes, ip, userAgent }) => {
  // Safe-guard: changes must be string for DB if it's not object
  const changesStr = typeof changes === 'object' ? JSON.stringify(changes) : JSON.stringify({ note: changes });

  await connection.query(
    `INSERT INTO system_audit_logs (user_id, action, target_type, target_id, changes, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, action, targetType, targetId, changesStr, ip || null, userAgent || null]
  );
};
