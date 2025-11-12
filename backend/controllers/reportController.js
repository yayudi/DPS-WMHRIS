// backend/controllers/reportController.js
import { getReportFilters } from "../services/reportService.js";
import db from "../config/db.js";

/**
 * [BARU] Menerima permintaan ekspor dan menambahkannya ke antrian.
 */
export const requestStockReport = async (req, res) => {
  try {
    const userId = req.user.id; // Asumsi dari authenticateToken
    const filters = req.body; // Filter sekarang dari POST body

    const [result] = await db.query(
      `INSERT INTO export_jobs (user_id, status, filters) VALUES (?, 'PENDING', ?)`,
      [userId, JSON.stringify(filters || {})]
    );

    res.status(202).json({
      message: "Permintaan ekspor diterima. Laporan sedang dibuat.",
      jobId: result.insertId,
    });
  } catch (error) {
    console.error("Error saat requestStockReport:", error);
    res.status(500).json({ message: "Gagal membuat permintaan ekspor." });
  }
};

/**
 * [BARU] Mengambil daftar pekerjaan ekspor untuk pengguna yang sedang login.
 */
export const getUserExportJobs = async (req, res) => {
  try {
    const userId = req.user.id;

    const [jobs] = await db.query(
      `SELECT id, status, file_path, error_message, created_at
        FROM export_jobs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );

    // Ubah file_path menjadi URL yang bisa diunduh
    const jobsWithUrl = jobs.map((job) => {
      if (job.file_path) {
        // const fileName = job.file_path.split(/\/|\\/).pop();
        const fileName = job.file_path;
        job.download_url = `/exports/${fileName}`;
        console.log(
          `[Controller] Membuat download_url untuk Job ID ${job.id}: ${job.download_url}`
        );
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
