// backend\repositories\jobRepository.js
import { JOB_STATUS, EXPORT_JOB_TYPE } from "../config/jobConstants.js";

// ============================================================================
// GENERAL CRUD
// ============================================================================

export const create = async (
  connection,
  { userId, jobType, filename, filePath, notes, options }
) => {
  const optionsStr = options ? JSON.stringify(options) : null;
  const [result] = await connection.query(
    `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, notes, options, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [userId, jobType, filename, filePath, JOB_STATUS.PENDING, notes || null, optionsStr]
  );
  return result.insertId;
};

export const createImportJob = create;

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const update = async (connection, jobId, { status, summary, errorLog }) => {
  const errorLogStr = errorLog ? JSON.stringify(errorLog) : null;
  if (status === JOB_STATUS.PROCESSING) {
    await connection.query(
      `UPDATE import_jobs
        SET status = ?, log_summary = ?, error_log = ?, processing_started_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [status, summary, errorLogStr, jobId]
    );
  } else {
    await connection.query(
      `UPDATE import_jobs
        SET status = ?, log_summary = ?, error_log = ?, updated_at = NOW()
        WHERE id = ?`,
      [status, summary, errorLogStr, jobId]
    );
  }
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} userId
 * @param {number} limit
 * @returns {Promise<any>}
 */
export const findByUser = async (connection, userId, limit = 20, jobTypes = null) => {
  let query = `
     SELECT ij.*, u.username as uploader_name 
     FROM import_jobs ij
     LEFT JOIN users u ON ij.user_id = u.id
     WHERE ij.user_id = ? 
  `;
  const params = [userId];

  if (jobTypes && Array.isArray(jobTypes) && jobTypes.length > 0) {
    query += ` AND ij.job_type IN (?) `;
    params.push(jobTypes);
  }

  query += ` ORDER BY ij.created_at DESC LIMIT ?`;
  params.push(limit);

  const [rows] = await connection.query(query, params);
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} limit
 * @param {string[]|null} jobTypes
 * @returns {Promise<any>}
 */
export const findAll = async (connection, limit = 50, jobTypes = null) => {
  let query = `
     SELECT ij.*, u.username as uploader_name 
     FROM import_jobs ij
     LEFT JOIN users u ON ij.user_id = u.id
  `;
  const params = [];

  if (jobTypes && Array.isArray(jobTypes) && jobTypes.length > 0) {
    query += ` WHERE ij.job_type IN (?) `;
    params.push(jobTypes);
  }

  query += ` ORDER BY ij.created_at DESC LIMIT ?`;
  params.push(limit);

  const [rows] = await connection.query(query, params);
  return rows;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {any} processed
 * @param {any} total
 * @returns {Promise<any>}
 */
export const updateProgress = async (connection, jobId, processed, total) => {
  return connection.query(
    `UPDATE import_jobs
      SET processed_records = ?, total_records = ?, updated_at = NOW()
      WHERE id = ?`,
    [processed, total, jobId]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {number|string} userId
 * @returns {Promise<any>}
 */
export const voidJob = async (connection, jobId, userId) => {
  const [result] = await connection.query(
    `UPDATE import_jobs
      SET status = ?, updated_at = NOW()
      WHERE id = ? AND status = ? AND user_id = ?`,
    [JOB_STATUS.VOID, jobId, JOB_STATUS.PENDING, userId]
  );
  return result.affectedRows > 0;
};

// ============================================================================
// IMPORT JOBS (Worker Specific)
// ============================================================================

/**
 * Ambil Job Pending ATAU Job Retrying yang sudah menunggu > 10 detik secara atomik
 * Mencegah Race Condition antar cron.
 */
export const getAndLockPendingImportJob = async (connection) => {
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(
      `SELECT * FROM import_jobs
        WHERE status = ?
        OR (status = ? AND updated_at <= NOW() - INTERVAL 10 SECOND)
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE`,
      [JOB_STATUS.PENDING, JOB_STATUS.RETRYING]
    );

    if (rows.length === 0) {
      await connection.commit();
      return null;
    }

    const job = rows[0];

    await connection.query(
      `UPDATE import_jobs SET status = ?, processing_started_at = NOW() WHERE id = ?`,
      [JOB_STATUS.PROCESSING, job.id]
    );

    await connection.commit();
    return job;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {any} currentRetryCount
 * @param {any} errorMessage
 * @returns {Promise<any>}
 */
export const retryImportJob = async (connection, jobId, currentRetryCount, errorMessage) => {
  const nextRetry = currentRetryCount + 1;
  const note = `Retry #${nextRetry}: ${errorMessage.substring(0, 100)}...`;

  return connection.query(
    `UPDATE import_jobs
      SET status = ?,
        retry_count = ?,
        log_summary = IF(log_summary IS NULL, ?, CONCAT(log_summary, ' | ', ?)),
        updated_at = NOW()
      WHERE id = ?`,
    [JOB_STATUS.RETRYING, nextRetry, note, note, jobId]
  );
};

// ... (Fungsi complete, fail, export lainnya TETAP SAMA) ...
export const completeImportJob = async (
  connection,
  jobId,
  status,
  summary,
  errorLogJSON = null
) => {
  return connection.query(
    `UPDATE import_jobs
      SET status = ?, log_summary = ?, error_log = ?, updated_at = NOW()
      WHERE id = ?`,
    [status, summary, errorLogJSON, jobId]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {any} summary
 * @returns {Promise<any>}
 */
export const failImportJob = async (connection, jobId, summary) => {
  return connection.query(
    `UPDATE import_jobs SET status = ?, log_summary = ?, updated_at = NOW() WHERE id = ?`,
    [JOB_STATUS.FAILED, summary, jobId]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {any} timeoutMinutes
 * @returns {Promise<any>}
 */
export const timeoutStuckImportJobs = async (connection, timeoutMinutes) => {
  return connection.query(
    `UPDATE import_jobs
      SET status = ?,
          log_summary = CONCAT(COALESCE(log_summary, ''), ' [SYSTEM: Job Killed due to timeout/crash]'),
          updated_at = NOW()
      WHERE status = ?
      AND updated_at < NOW() - INTERVAL ? MINUTE`,
    [JOB_STATUS.FAILED, JOB_STATUS.PROCESSING, timeoutMinutes]
  );
};

// ============================================================================
// EXPORT JOBS
// ============================================================================

// Fungsi untuk membuat Job Export baru
/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} options
 * @returns {Promise<any>}
 */
export const createExportJob = async (connection, { userId, filters, jobType }) => {
  const filtersStr = JSON.stringify(filters);
  const [result] = await connection.query(
    `INSERT INTO export_jobs (user_id, status, filters, job_type, created_at)
      VALUES (?, ?, ?, ?, NOW())`,
    [userId, JOB_STATUS.PENDING, filtersStr, jobType || EXPORT_JOB_TYPE.STOCK_REPORT]
  );
  return result.insertId;
};

/**
 * Ambil dan lock Job Export secara atomik
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<any>}
 */
export const getAndLockPendingExportJob = async (connection) => {
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(
      `SELECT * FROM export_jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [JOB_STATUS.PENDING]
    );

    if (rows.length === 0) {
      await connection.commit();
      return null;
    }

    const job = rows[0];

    await connection.query(
      `UPDATE export_jobs SET status = ?, processing_started_at = NOW() WHERE id = ?`,
      [JOB_STATUS.PROCESSING, job.id]
    );

    await connection.commit();
    return job;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {any} filename
 * @returns {Promise<any>}
 */
export const completeExportJob = async (connection, jobId, filename) => {
  return connection.query(
    `UPDATE export_jobs SET status = ?, file_path = ? WHERE id = ?`,
    [JOB_STATUS.COMPLETED, filename, jobId]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} jobId
 * @param {any} errorMessage
 * @returns {Promise<any>}
 */
export const failExportJob = async (connection, jobId, errorMessage) => {
  return connection.query(
    `UPDATE export_jobs SET status = ?, error_message = ? WHERE id = ?`,
    [JOB_STATUS.FAILED, errorMessage, jobId]
  );
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {any} timeoutMinutes
 * @returns {Promise<any>}
 */
export const timeoutStuckExportJobs = async (connection, timeoutMinutes) => {
  return connection.query(
    `UPDATE export_jobs
      SET status = ?, error_message = CONCAT('Job timeout after ', ?, ' minutes')
      WHERE status = ?
      AND processing_started_at < NOW() - INTERVAL ? MINUTE`,
    [JOB_STATUS.FAILED, timeoutMinutes, JOB_STATUS.PROCESSING, timeoutMinutes]
  );
};
