import catchAsync from "../utils/catchAsync.js";
// backend/controllers/reportController.js
import { getReportFilters } from "../repositories/reportRepository.js";
import db from "../config/db.js";
import * as jobRepo from "../repositories/jobRepository.js";
import { parseJsonSafe } from "../utils/jsonUtils.js";
import { withConnection } from "../utils/dbUtils.js";
import { EXPORT_JOB_TYPE } from "../config/jobConstants.js";
// [FIX V5] Tentukan URL Backend Secara Dinamis
// Agar bisa jalan di Localhost maupun Production tanpa ubah code
const getBaseUrl = (req) => {
  return `${req.protocol}://${req.get("host")}`;
};

/**
 * Menerima permintaan ekspor dan menambahkannya ke antrian.
 */
export const requestStockReport = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const filters = req.body;

  const jobId = await jobRepo.createExportJob(db, {
    userId,
    filters: filters || {},
    jobType: EXPORT_JOB_TYPE.STOCK_REPORT,
  });

  res.status(202).json({
    message: "Permintaan ekspor diterima. Laporan sedang dibuat.",
    jobId,
  });
});

/**
 * Mengambil daftar pekerjaan ekspor untuk pengguna yang sedang login.
 */
export const getUserExportJobs = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const [jobs] = await db.query(
    `SELECT id, status, file_path, error_message, created_at, filters
      FROM export_jobs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 20`,
    [userId],
  );

  // Ubah file_path menjadi URL Lengkap (Absolute URL) & Parse Filters
  const jobsWithUrl = jobs.map((job) => {
    // Parse Filters untuk mendapatkan Tipe Export
    const parsedFilters = parseJsonSafe(job.filters, {});
    job.type = parsedFilters.exportType || "STOCK_REPORT";

    if (job.file_path) {
      const fileName = job.file_path;

      // Frontend tidak perlu pusing soal Proxy, langsung tembak ke API
      const baseUrl = getBaseUrl(req);
      job.download_url = `${baseUrl}/uploads/exports/stocks/${fileName}`;
    }
    return job;
  });

  res.status(200).json({ success: true, data: jobsWithUrl });
});

export const fetchReportFilters = catchAsync(async (req, res, next) => {
  const filters = await withConnection(async (connection) => getReportFilters(connection));
  res.status(200).json({ success: true, data: filters });
});
