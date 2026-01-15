// backend/controllers/reportController.js
import { getReportFilters } from "../repositories/reportRepository.js";
import db from "../config/db.js";
import * as jobRepo from "../repositories/jobRepository.js";

// [FIX V5] Tentukan URL Backend Secara Dinamis
// Agar bisa jalan di Localhost maupun Production tanpa ubah code
const getBaseUrl = (req) => {
  return `${req.protocol}://${req.get("host")}`;
};

/**
 * Menerima permintaan ekspor dan menambahkannya ke antrian.
 */
export const requestStockReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = req.body;

    const jobId = await jobRepo.createExportJob(db, {
      userId,
      filters: filters || {},
      jobType: "STOCK_REPORT",
    });

    res.status(202).json({
      message: "Permintaan ekspor diterima. Laporan sedang dibuat.",
      jobId,
    });
  } catch (error) {
    console.error("Error saat requestStockReport:", error);
    res.status(500).json({ message: "Gagal membuat permintaan ekspor." });
  }
};


/**
 * Mengambil daftar pekerjaan ekspor untuk pengguna yang sedang login.
 */
export const getUserExportJobs = async (req, res) => {
  try {
    const userId = req.user.id;

    const [jobs] = await db.query(
      `SELECT id, status, file_path, error_message, created_at, filters
        FROM export_jobs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );

    // Ubah file_path menjadi URL Lengkap (Absolute URL) & Parse Filters
    const jobsWithUrl = jobs.map((job) => {
      // Parse Filters untuk mendapatkan Tipe Export
      let exportType = "STOCK_REPORT"; // Default
      try {
        if (job.filters) {
          const parsed = JSON.parse(job.filters);
          if (parsed.exportType) exportType = parsed.exportType;
        }
      } catch (e) {
        // Ignore parse error
      }
      job.type = exportType;

      if (job.file_path) {
        const fileName = job.file_path;

        // Frontend tidak perlu pusing soal Proxy, langsung tembak ke API
        const baseUrl = getBaseUrl(req);
        job.download_url = `${baseUrl}/uploads/exports/stocks/${fileName}`;
      }
      return job;
    });

    res.status(200).json({ success: true, data: jobsWithUrl });
  } catch (error) {
    console.error("Error saat getUserExportJobs:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat pekerjaan." });
  }
};

export const fetchReportFilters = async (req, res) => {
  try {
    const filters = await getReportFilters();
    res.status(200).json({ success: true, data: filters });
  } catch (error) {
    console.error("Error di reportController fetchReportFilters:", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data filter laporan.",
    });
  }
};
