// backend/scripts/workers/exportQueue.js
import db from "../../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Logger from "../../utils/logger.js";
import { ensureDirectoryExists } from "../../utils/workerHelpers.js";
import { getFormattedDateTime } from "../../services/helpers/sharedHelpers.js";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";
import { emitSharedTaskSignal } from "../../services/firebaseSignalService.js";

// SERVICE
import {
  generateStockReportStreaming,
  generateProductExportStreaming,
} from "../../services/exportService.js";
import * as packageExportService from "../../services/packageExportService.js";
import * as statisticExportService from "../../services/statisticService.js";

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 15;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR_PATH = path.join(__dirname, "..", "..", "uploads", "exports", "stocks");

ensureDirectoryExists(EXPORT_DIR_PATH, "EXPORT_WORKER");

export const processQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // Clean Up Stuck Jobs
    await jobRepo.timeoutStuckExportJobs(connection, JOB_TIMEOUT_MINUTES);

    // Ambil Job Pending dan Lock secara atomik
    const job = await jobRepo.getAndLockPendingExportJob(connection);
    if (!job) {
      connection.release();
      return;
    }

    jobId = job.id;
    Logger.info(`Memulai Job ID: ${jobId}`, "EXPORT_WORKER");
    connection.release();

    // Parse Filters & Determine Type (Mendukung tipe String maupun Object ter-parse dari MySQL)
    let filters = {};
    if (typeof job.filters === "string") {
      try {
        filters = JSON.parse(job.filters || "{}");
      } catch (err) {
        Logger.warn("Gagal parse job.filters string, fallback ke {}", "EXPORT_WORKER", err);
        filters = {};
      }
    } else if (job.filters && typeof job.filters === "object") {
      filters = job.filters;
    }

    const exportType = filters.exportType || "STOCK_REPORT";
    const dateStr = getFormattedDateTime();
    const ext = filters.format === "csv" ? ".csv" : ".xlsx";
    const fileName =
      exportType === "PRODUCT_MASTER"
        ? `Master_Produk_${dateStr}_(Job-${jobId})${ext}`
        : exportType === "EXPORT_PACKAGES"
          ? `Data_Paket_${dateStr}_(Job-${jobId})${ext}`
          : exportType === "STATISTICS_STOCK_MOVEMENT"
            ? `Statistik_Stok_${dateStr}_(Job-${jobId})${ext}`
            : exportType === "INVENTORY_VALUE"
              ? `Nilai_Inventaris_${dateStr}_(Job-${jobId})${ext}`
              : exportType === "BATCH_LOG_EXPORT"
                ? `Batch_Log_${dateStr}_(Job-${jobId})${ext}`
                : `Laporan_Stok_${dateStr}_(Job-${jobId})${ext}`;

    const filePath = path.join(EXPORT_DIR_PATH, fileName);

    // DISPATCHER
    Logger.info(`Dispatching service for type: ${exportType}`, "EXPORT_WORKER");
    if (exportType === "PRODUCT_MASTER") {
      await generateProductExportStreaming(filters, filePath);
    } else if (exportType === "EXPORT_PACKAGES") {
      await packageExportService.generatePackageExport(filters, filePath);
    } else if (exportType === "STATISTICS_STOCK_MOVEMENT") {
      await statisticExportService.generateStatisticExport(filters, filePath);
    } else if (exportType === "BATCH_LOG_EXPORT") {
      await import("../../services/exportService.js").then((m) =>
        m.generateBatchLogExportStreaming(filters, filePath)
      );
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
      Logger.warn("Gagal cek file size", "EXPORT_WORKER", e);
    }

    if (fileSize === 0) throw new Error("File Excel yang dihasilkan kosong (0 bytes).");

    // Complete Job
    const updateConnection = await db.getConnection();
    try {
      Logger.info(`Updating job ${jobId} status to COMPLETED...`, "EXPORT_WORKER");
      await jobRepo.completeExportJob(updateConnection, jobId, `${fileName}`);
      emitSharedTaskSignal('BACKGROUND_JOBS', 'EXPORT_COMPLETED').catch(e => Logger.error("Signal Error", e, "EXPORT_WORKER"));
    } finally {
      updateConnection.release();
    }

    Logger.info(`Job ID ${jobId} SELESAI. File: ${fileName}`, "EXPORT_WORKER");
  } catch (error) {
    Logger.error(`Job ID ${jobId} GAGAL`, error, "EXPORT_WORKER");
    if (jobId) {
      try {
        const errConnection = await db.getConnection();
        await jobRepo.failExportJob(errConnection, jobId, error.message.substring(0, 255));
        errConnection.release();
        emitSharedTaskSignal('BACKGROUND_JOBS', 'EXPORT_FAILED').catch(e => Logger.error("Signal Error", e, "EXPORT_WORKER"));
      } catch (dbError) {
        Logger.error("Fatal DB Error saat update FAILED", dbError, "EXPORT_WORKER");
      }
    }
  }
};

// Runner jika dijalankan manual via node
if (import.meta.url === `file://${process.argv[1]}`) {
  Logger.info("Mode Standalone Aktif", "EXPORT_WORKER");
  processQueue()
    .then(() => {
      Logger.info("Selesai.", "EXPORT_WORKER");
      process.exit(0);
    })
    .catch((err) => {
      Logger.error("Error", err, "EXPORT_WORKER");
      process.exit(1);
    });
}
