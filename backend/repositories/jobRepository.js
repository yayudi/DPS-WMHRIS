// backend\repositories\jobRepository.js
// ============================================================================
// GENERAL CRUD (Used by jobService)
// ============================================================================

// Create Job Baru
export const create = async (connection, { userId, jobType, filename, filePath, notes }) => {
  const [result] = await connection.query(
    `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
    [userId, jobType, filename, filePath, notes || null]
  );
  return result.insertId;
};

// Update Status & Log Job
export const update = async (connection, jobId, { status, summary, errorLog }) => {
  const errorLogStr = errorLog ? JSON.stringify(errorLog) : null;
  // Jika status berubah jadi PROCESSING, set processing_started_at
  if (status === "PROCESSING") {
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

// Ambil History Job User
export const findByUser = async (connection, userId, limit = 20) => {
  const [rows] = await connection.query(
    `SELECT id, status, job_type, original_filename, log_summary, error_log, created_at, notes
      FROM import_jobs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit]
  );
  return rows;
};

// Cancel Job (Hanya jika status PENDING)
export const cancel = async (connection, jobId, userId) => {
  const [result] = await connection.query(
    `UPDATE import_jobs
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = ? AND status = 'PENDING' AND user_id = ?`,
    [jobId, userId]
  );
  return result.affectedRows > 0;
};

// ============================================================================
// IMPORT JOBS (Worker Specific)
// ============================================================================

export const getPendingImportJob = async (connection) => {
  const [rows] = await connection.query(
    `SELECT * FROM import_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
};

export const lockImportJob = async (connection, jobId) => {
  return connection.query(
    `UPDATE import_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?`,
    [jobId]
  );
};

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

export const failImportJob = async (connection, jobId, summary) => {
  return connection.query(
    `UPDATE import_jobs SET status = 'FAILED', log_summary = ?, updated_at = NOW() WHERE id = ?`,
    [summary, jobId]
  );
};

// ============================================================================
// EXPORT JOBS
// ============================================================================

export const getPendingExportJob = async (connection) => {
  const [rows] = await connection.query(
    `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
};

export const lockExportJob = async (connection, jobId) => {
  return connection.query(
    `UPDATE export_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?`,
    [jobId]
  );
};

export const completeExportJob = async (connection, jobId, filename) => {
  return connection.query(
    `UPDATE export_jobs SET status = 'COMPLETED', file_path = ? WHERE id = ?`,
    [filename, jobId]
  );
};

export const failExportJob = async (connection, jobId, errorMessage) => {
  return connection.query(
    `UPDATE export_jobs SET status = 'FAILED', error_message = ? WHERE id = ?`,
    [errorMessage, jobId]
  );
};

export const timeoutStuckExportJobs = async (connection, timeoutMinutes) => {
  return connection.query(
    `UPDATE export_jobs
     SET status = 'FAILED', error_message = CONCAT('Job timeout after ', ?, ' minutes')
     WHERE status = 'PROCESSING'
     AND processing_started_at < NOW() - INTERVAL ? MINUTE`,
    [timeoutMinutes, timeoutMinutes]
  );
};
