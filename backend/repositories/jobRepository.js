// backend\repositories\jobRepository.js
import db from "../config/db.js";

// ============================================================================
// IMPORT JOBS
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
