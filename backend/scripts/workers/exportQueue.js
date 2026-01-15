// backend/scripts/workers/exportQueue.js
import db from "../../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";

// SERVICE
import {
  generateStockReportStreaming,
  generateProductExportStreaming,
} from "../../services/exportService.js";
import * as packageExportService from "../../services/packageExportService.js";

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
    // console.log("[ExportWorker] Checking stuck jobs...");
    await jobRepo.timeoutStuckExportJobs(connection, JOB_TIMEOUT_MINUTES);

    // Ambil Job Pending
    const job = await jobRepo.getPendingExportJob(connection);
    if (!job) {
      // console.log("[ExportWorker] No pending job found.");
      connection.release();
      return;
    }

    jobId = job.id;
    console.log(`[ExportWorker] Memulai Job ID: ${jobId}`);

    // Lock Job
    console.log(`[ExportWorker] Locking Job ${jobId}...`);
    await jobRepo.lockExportJob(connection, jobId);
    console.log(`[ExportWorker] Job ${jobId} LOCKED. Releasing main connection.`);

    // Release koneksi utama karena proses generate akan memakan waktu dan menggunakan koneksi streaming sendiri di service
    connection.release();

    // Parse Filters & Determine Type
    const filters = JSON.parse(job.filters || "{}");
    const exportType = filters.exportType || "STOCK_REPORT";

    // ✅ FORCE EXCEL EXTENSION
    const dateStr = getFormattedDateTime();
    const fileName =
      exportType === "PRODUCT_MASTER"
        ? `Master_Produk_${dateStr}_(Job-${jobId}).xlsx`
        : exportType === "EXPORT_PACKAGES"
        ? `Data_Paket_${dateStr}_(Job-${jobId}).xlsx`
        : `Laporan_Stok_${dateStr}_(Job-${jobId}).xlsx`;

    const filePath = path.join(EXPORT_DIR_PATH, fileName);

    // DISPATCHER
    console.log(`[ExportWorker] Dispatching service for type: ${exportType}`);
    if (exportType === "PRODUCT_MASTER") {
      await generateProductExportStreaming(filters, filePath);
    } else if (exportType === "EXPORT_PACKAGES") {
      await packageExportService.generatePackageExport(filters, filePath);
    } else {
      await generateStockReportStreaming(filters, filePath);
    }

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

    // Complete Job
    const updateConnection = await db.getConnection();
    try {
      console.log(`[ExportWorker] Updating job ${jobId} status to COMPLETED...`);
      await jobRepo.completeExportJob(updateConnection, jobId, `${fileName}`);
    } finally {
      updateConnection.release();
    }

    console.log(`[ExportWorker] Job ID ${jobId} SELESAI. File: ${fileName}`);
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
