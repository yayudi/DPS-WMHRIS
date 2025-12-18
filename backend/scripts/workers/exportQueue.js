// backend/scripts/workers/exportQueue.js
import db from "../../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";

// SERVICE
import { generateStockReportStreaming } from "../../services/exportService.js";

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 15;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR_PATH = path.join(__dirname, "..", "..", "uploads", "exports", "stocks");

if (!fs.existsSync(EXPORT_DIR_PATH)) {
  try {
    fs.mkdirSync(EXPORT_DIR_PATH, { recursive: true });
  } catch (err) {
    console.error(`GAGAL membuat folder ekspor: ${err.message}`);
  }
}

const getFormattedDateTime = () => {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now
    .getDate()
    .toString()
    .padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}-${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

export const processQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // Clean Up Stuck Jobs
    await jobRepo.timeoutStuckExportJobs(connection, JOB_TIMEOUT_MINUTES);

    // Ambil Job Pending
    const job = await jobRepo.getPendingExportJob(connection);
    if (!job) {
      connection.release();
      return;
    }

    jobId = job.id;
    console.log(`[ExportWorker] Memulai Job ID: ${jobId}`);

    // Lock Job
    await jobRepo.lockExportJob(connection, jobId);

    // Release koneksi utama karena proses generate akan memakan waktu dan menggunakan koneksi streaming sendiri di service
    connection.release();

    // Prepare File Path
    const dateStr = getFormattedDateTime();
    const fileName = `Laporan_Stok_${dateStr}_(Job-${jobId}).xlsx`;
    const filePath = path.join(EXPORT_DIR_PATH, fileName);
    const filters = JSON.parse(job.filters || "{}");

    // Panggil Service untuk Generate Excel
    await generateStockReportStreaming(filters, filePath);

    // Validasi File Size
    let fileSize = 0;
    try {
      await new Promise((r) => setTimeout(r, 100)); // Delay for OS flush
      const stats = fs.statSync(filePath);
      fileSize = stats.size;
    } catch (e) {
      console.warn(`Gagal cek file size: ${e.message}`);
    }

    if (fileSize === 0) throw new Error("File Excel yang dihasilkan kosong (0 bytes).");

    // Complete Job (Re-open short connection)
    const updateConnection = await db.getConnection();
    try {
      await jobRepo.completeExportJob(
        updateConnection,
        jobId,
        `/uploads/exports/stocks/${fileName}`
      );
    } finally {
      updateConnection.release();
    }

    console.log(`[ExportWorker] Job ID ${jobId} SELESAI.`);
  } catch (error) {
    console.error(`[ExportWorker] Job ID ${jobId} GAGAL: ${error.message}`);
    if (jobId) {
      try {
        const errConnection = await db.getConnection();
        await jobRepo.failExportJob(errConnection, jobId, error.message.substring(0, 255));
        errConnection.release();
      } catch (dbError) {
        console.error("Fatal DB Error saat update FAILED:", dbError);
      }
    }
  }
};

// Runner jika dijalankan manual via node
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[ExportWorker] Mode Standalone Aktif");
  processQueue()
    .then(() => {
      console.log("[ExportWorker] Selesai.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[ExportWorker] Error:", err);
      process.exit(1);
    });
}
