// backend/scripts/workers/importQueue.js
// IMPORTS
import db from "../../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Logger from "../../utils/logger.js";
import { ensureDirectoryExists, generateErrorFile } from "../../utils/workerHelpers.js";
import { parseJsonSafe } from "../../utils/jsonUtils.js";
import { JOB_STATUS, IMPORT_JOB_TYPE } from "../../config/jobConstants.js";

// SERVICES
import { ParserEngine } from "../../services/parsers/ParserEngine.js";

// IMPORT SERVICES
import { syncOrdersToDB } from "../../services/pickingImportService.js";
import { processAttendanceImport } from "../../services/attendanceImportService.js";
import * as productImportService from "../../services/productImportService.js";
import { processPackageImport } from "../../services/packageImportService.js";
import * as stockImportService from "../../services/stockImportService.js";
import * as scheduleImportService from "../../services/scheduleImportService.js";
import * as mediaImportService from "../../services/mediaImportService.js";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";
import { signals } from "../../services/firebaseSignalService.js";

// --- KONFIGURASI & PATH ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, "..", "..", "uploads", "exports");

// Konfigurasi Retry
const MAX_RETRIES = 3;
const JOB_TIMEOUT_MINUTES = 5;

ensureDirectoryExists(EXPORT_DIR);

// --- MAIN WORKER LOGIC ---

export const importQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // 0. SELF-HEALING
    await jobRepo.timeoutStuckImportJobs(connection, JOB_TIMEOUT_MINUTES);

    // 1. Ambil Job (Atomik dengan Row-Level Lock)
    const job = await jobRepo.getAndLockPendingImportJob(connection);

    if (!job) {
      connection.release();
      return;
    }

    jobId = job.id;
    connection.release();
    let absoluteFilePath = job.file_path;
    if (!path.isAbsolute(absoluteFilePath)) {
      absoluteFilePath = path.resolve(__dirname, "../..", absoluteFilePath);
    }

    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File fisik tidak ditemukan di server: ${absoluteFilePath}`);
    }

    const retryInfo = job.retry_count > 0 ? `(Retry #${job.retry_count})` : "";
    Logger.info(`Starting Job ${jobId} ${retryInfo}: ${job.job_type}`, "IMPORT_WORKER");
    Logger.info(`Processing File: ${absoluteFilePath}`, "IMPORT_WORKER");

    connection = await db.getConnection();
    let logSummary = "";
    let errors = [];
    let processStats = {};
    let headerRowIndex = 1;
    let isPartialSuccess = false;
    let nextOptions = null;

    // Parse options
    const jobOptions = parseJsonSafe(job.options, {});

    const updateJobProgress = async (processed, total) => {
      try {
        await jobRepo.updateProgress(connection, jobId, processed, total);
        signals.jobProgress();
      } catch {
        // Abaikan error update progress
      }
    };

    const isDryRun = job.job_type.endsWith("_DRY_RUN");
    const realJobType = (isDryRun ? job.job_type.replace("_DRY_RUN", "") : job.job_type).trim();

    // --- SWITCH CASE ---
    if (realJobType.startsWith("IMPORT_SALES_")) {
      const sourceMap = {
        IMPORT_SALES_TOKOPEDIA: "Tokopedia",
        IMPORT_SALES_SHOPEE: "Shopee",
        IMPORT_SALES_OFFLINE: "Offline",
      };
      const source = sourceMap[realJobType];
      if (!source) throw new Error(`Unknown Import Type: ${job.job_type}`);

      const parser = new ParserEngine(absoluteFilePath, source);
      const { orders, stats, errors: pErrors, headerRowIndex: hIdx } = await parser.run();
      headerRowIndex = hIdx;

      for (const order of orders.values()) order.source = source;

      const syncResult = await syncOrdersToDB(
        connection,
        orders,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
        jobOptions.purpose,
        jobOptions.shopName,
      );

      const logicErrors = [];
      const rawErrors = syncResult.errors || [];
      for (const err of rawErrors) {
        if (typeof err === "object" && err.row) {
          logicErrors.push(err);
          continue;
        }
        const msg = typeof err === "string" ? err : err.message;
        logicErrors.push({ message: msg });
      }

      errors = [...pErrors, ...logicErrors];
      processStats = stats;

      const modeText = isDryRun ? "[SIMULASI] " : "";
      logSummary = `${modeText}Selesai ${source}. DB Update: ${
        syncResult.updatedCount || 0
      } Invoice.`;
    } else if (realJobType === "ADJUST_STOCK") {
      const result = await stockImportService.processStockImport(
        connection,
        absoluteFilePath,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
      );
      logSummary = result.logSummary;
      errors = (result.errors || []).map((e) => ({ row: e.row, message: e.message }));
      processStats = result.stats || {};
    } else if (realJobType === IMPORT_JOB_TYPE.ATTENDANCE) {
      const result = await processAttendanceImport(
        connection,
        absoluteFilePath,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
        jobOptions,
      );
      if (result.headerRowIndex) headerRowIndex = result.headerRowIndex;
      logSummary = result.logSummary;
      errors = result.errors || [];
      processStats = result.stats || {};
    } else if (
      realJobType === IMPORT_JOB_TYPE.BATCH_EDIT_PRODUCT ||
      job.job_type === `${IMPORT_JOB_TYPE.BATCH_EDIT_PRODUCT}_DRY_RUN`
    ) {
      const result = await productImportService.processProductImport(
        connection,
        absoluteFilePath,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
        jobOptions,
      );

      if (result.headerRowIndex) headerRowIndex = result.headerRowIndex;
      logSummary = result.logSummary;
      errors = (result.errors || []).map((e) => ({
        row: e.row,
        message: typeof e === "string" ? e : e.message,
      }));
      processStats = result.stats || {};

      if (result.partial) {
        isPartialSuccess = true;
        nextOptions = result.nextOptions;
      }
    } else if (realJobType === IMPORT_JOB_TYPE.PACKAGES) {
      const result = await processPackageImport(
        absoluteFilePath,
        jobId,
        updateJobProgress,
        job.user_id,
      );
      // Package Import returns { successCount, errors, headerRowIndex }
      if (result.headerRowIndex) headerRowIndex = result.headerRowIndex;
      logSummary = `Selesai Import Paket. Berhasil: ${result.successCount}.`;
      errors = (result.errors || []).map((e) => {
        const match = typeof e === "string" ? e.match(/^Row (\d+):\s*(.*)/) : null;
        return {
          row: match ? parseInt(match[1], 10) : 0,
          message: match ? match[2] : e,
        };
      });
      processStats = { success: result.successCount };
    } else if (realJobType === IMPORT_JOB_TYPE.STOCK_INBOUND) {
      const result = await stockImportService.processStockInboundImport(
        jobId,
        absoluteFilePath,
        job.user_id,
        job.notes,
      );
      // Stock Import returns { success: boolean, count: number, errors: [] }
      if (result.success) {
        logSummary = `Selesai Inbound Massal via Excel. Berhasil: ${result.count} items.`;
        processStats = { success: result.count };
        errors = (result.errors || []).map((e) => ({ row: e.row, message: e.error || e.message }));
      } else {
        logSummary = "Gagal memproses Inbound Massal.";
        processStats = { success: 0 };
        errors = (result.errors || []).map((e) => ({ row: e.row, message: e.error || e.message }));
      }
    } else if (realJobType === IMPORT_JOB_TYPE.SCHEDULES) {
      const result = await scheduleImportService.processScheduleImport(
        jobId,
        absoluteFilePath,
        job.user_id,
      );
      if (result.success) {
        logSummary = `Selesai Import Jadwal. Berhasil: ${result.count} data.`;
        processStats = { success: result.count };
        errors = [];
      } else {
        logSummary = "Gagal memproses Import Jadwal.";
        processStats = { success: 0 };
        errors = result.errors || [];
      }
    } else if (realJobType === IMPORT_JOB_TYPE.LINK_MEDIA_EXCEL) {
      const result = await mediaImportService.processMediaLinkImport(
        connection,
        absoluteFilePath,
        job.user_id,
      );
      if (result.headerRowIndex) headerRowIndex = result.headerRowIndex;
      if (result.success) {
        logSummary = `Selesai Tautkan Massal Media via Excel. Berhasil: ${result.successCount}, Gagal: ${result.failCount}.`;
        processStats = { success: result.successCount, fail: result.failCount };
        errors = result.errors || [];
        // Firebase notification logic will be added at the end if needed, but we can emit signals directly in the service or here.
        signals.refreshProducts();
        signals.refreshMedia();
      } else {
        logSummary = "Gagal memproses Tautkan Massal Media.";
        processStats = { success: 0 };
        errors = result.errors || [];
      }
    } else {
      throw new Error(`Job Type tidak dikenal: ${job.job_type}`);
    }

    // --- SUCCESS PATH ---

    if (isPartialSuccess) {
      const nextOptionsStr = JSON.stringify({ ...jobOptions, ...nextOptions });
      const pauseMsg = ` [PAUSED] ${logSummary}`;

      await connection.query(
        `UPDATE import_jobs
          SET status = ?,
            options = ?,
            log_summary = ?,
            updated_at = NOW()
          WHERE id = ?`,
        [JOB_STATUS.PENDING, nextOptionsStr, pauseMsg, jobId],
      );
      Logger.info(`Job ${jobId} PAUSED (Resumable). Next offset saved.`, "IMPORT_WORKER");
      return;
    }

    let finalStatus = JOB_STATUS.COMPLETED;
    if (errors.length > 0) {
      finalStatus = JOB_STATUS.COMPLETED_WITH_ERRORS;
      const errDetail = typeof errors[0] === "object" ? errors[0].message : errors[0];
      logSummary += ` (${errors.length} errors. Contoh: ${errDetail?.substring(0, 50)}...)`;
    }
    if (processStats.success === 0 && errors.length > 0) {
      finalStatus = JOB_STATUS.FAILED;
    }

    let downloadUrl = null;
    if (errors.length > 0) {
      downloadUrl = await generateErrorFile(
        absoluteFilePath,
        errors,
        headerRowIndex,
        jobId,
        EXPORT_DIR,
      );
    }

    let errorLogJSON = null;
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        summary: logSummary,
        download_url: downloadUrl,
        errors:
          errors.length > 50
            ? errors
                .slice(0, 50)
                .concat([
                  { message: `... and ${errors.length - 50} more errors. See download file.` },
                ])
            : errors,
      };
      errorLogJSON = JSON.stringify(payload);
    } catch {
      errorLogJSON = JSON.stringify({ message: "Error log format invalid" });
    }

    if (processStats.success > 0 || finalStatus === JOB_STATUS.COMPLETED) {
      const total = processStats.success + (errors.length || 0);
      await jobRepo.updateProgress(connection, jobId, total, total);
    }

    await jobRepo.completeImportJob(connection, jobId, finalStatus, logSummary, errorLogJSON);
    signals.importCompleted();

    if (realJobType === IMPORT_JOB_TYPE.ATTENDANCE || realJobType === IMPORT_JOB_TYPE.SCHEDULES) {
      signals.refreshAttendance();
    }

    // Hapus file
    if (fs.existsSync(absoluteFilePath)) {
      try {
        fs.unlinkSync(absoluteFilePath);
      } catch {
        // Abaikan jika file sudah tidak ada
      }
    }

    Logger.info(`Job ${jobId} Finished: ${finalStatus} (DryRun: ${isDryRun})`, "IMPORT_WORKER");
  } catch (error) {
    Logger.error(`Job ${jobId} CRASHED`, error, "IMPORT_WORKER");

    if (jobId && connection) {
      try {
        const jobQuery = await connection.query(
          "SELECT retry_count FROM import_jobs WHERE id = ?",
          [jobId],
        );
        const currentRetry = jobQuery[0][0]?.retry_count || 0;

        const isRetriableError = (err) =>
          err.message.includes("deadlock") ||
          err.message.includes("timeout") ||
          err.message.includes("ECONNRESET");

        if (isRetriableError(error) && currentRetry < MAX_RETRIES) {
          Logger.warn(`Transient Error. Scheduling Retry #${currentRetry + 1}...`, "IMPORT_WORKER");
          await jobRepo.retryImportJob(connection, jobId, currentRetry, error.message);
        } else {
          await jobRepo.failImportJob(
            connection,
            jobId,
            `CRASH: ${error.message.substring(0, 255)}`,
          );
          signals.importFailed();
        }
      } catch (e) {
        Logger.error("Gagal update status CRASH/RETRY ke DB", e, "IMPORT_WORKER");
      }
    }
  } finally {
    if (connection) connection.release();
  }
};

if (
  import.meta.url.startsWith("file://") &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1])
) {
  Logger.info("Menjalankan Worker via CLI...", "IMPORT_WORKER");
  importQueue().finally(() => {
    if (db.pool) db.pool.end();
    Logger.info("Proses Selesai.", "IMPORT_WORKER");
    process.exit(0);
  });
}
