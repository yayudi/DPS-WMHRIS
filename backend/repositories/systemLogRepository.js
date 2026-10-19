// backend/repositories/systemLogRepository.js
import db from "../config/db.js";
import { buildTriStateWhere } from "../utils/sqlUtils.js";
import { normalizePagination } from "../utils/paginationUtils.js";

export const getLogs = async ({
  page = 1,
  limit = 20,
  search,
  action,
  targetType,
  userId,
  startDate,
  endDate,
}) => {
  const { limit: safeLimit, offset } = normalizePagination({ page, limit }, 20);
  const conditions = ["1=1"];
  const params = [];

  if (search) {
    conditions.push("(target_id LIKE ? OR changes LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const actionClauses = buildTriStateWhere("action", action, params);
  if (actionClauses.length > 0) conditions.push(...actionClauses);

  const targetClauses = buildTriStateWhere("target_type", targetType, params);
  if (targetClauses.length > 0) conditions.push(...targetClauses);

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
  const [countRows] = await db.query(
    `SELECT COUNT(*) as total FROM system_audit_logs WHERE ${whereSql}`,
    params,
  );
  const total = countRows[0].total;

  // Get Data
  const query = `
    SELECT l.*, u.username, u.nickname, r.name as role,
      CASE l.target_type
        WHEN 'USER' THEN (SELECT COALESCE(nickname, username) FROM users WHERE id = l.target_id)
        WHEN 'PRODUCT' THEN (SELECT name FROM products WHERE id = l.target_id)
        WHEN 'ROLE' THEN (SELECT name FROM roles WHERE id = l.target_id)
        WHEN 'LOCATION' THEN (SELECT name FROM locations WHERE id = l.target_id)
        WHEN 'CATEGORY' THEN (SELECT name FROM categories WHERE id = l.target_id)
        ELSE NULL
      END as target_name
    FROM system_audit_logs l
    LEFT JOIN users u ON l.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await db.query(query, [...params, safeLimit, offset]);

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
export const createLog = async (
  connection,
  { userId, action, targetType, targetId, changes, ip, userAgent },
) => {
  const changesStr =
    typeof changes === "object" ? JSON.stringify(changes) : JSON.stringify({ note: changes });

  await connection.query(
    `INSERT INTO system_audit_logs (user_id, action, target_type, target_id, changes, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, action, targetType, targetId, changesStr, ip || null, userAgent || null],
  );
};
