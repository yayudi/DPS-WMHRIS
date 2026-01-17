// backend/scripts/workers/importQueue.js
// IMPORTS
import db from "../../config/db.js";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";

// SERVICES
import { ParserEngine } from "../../services/parsers/ParserEngine.js";

// IMPORT SERVICES
import { syncOrdersToDB } from "../../services/pickingImportService.js";
import { processAttendanceImport } from "../../services/attendanceImportService.js";
import * as productImportService from "../../services/productImportService.js";
import * as packageImportService from "../../services/packageImportService.js";
import * as stockImportService from "../../services/stockImportService.js";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";

// --- KONFIGURASI & PATH ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, "..", "..", "uploads", "exports");

// Konfigurasi Retry
const MAX_RETRIES = 3;
const JOB_TIMEOUT_MINUTES = 5;

if (!fs.existsSync(EXPORT_DIR)) {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  } catch (err) {
    console.error(`[ImportWorker] Gagal membuat direktori export: ${err.message}`);
  }
}

// --- HELPER FUNCTIONS ---

async function cleanupStuckJobs(connection) {
  try {
    const [result] = await connection.query(
      `UPDATE import_jobs
             SET status = 'FAILED',
                 log_summary = CONCAT(COALESCE(log_summary, ''), ' [SYSTEM: Job Killed due to timeout/crash]'),
                 updated_at = NOW()
             WHERE status = 'PROCESSING'
             AND updated_at < NOW() - INTERVAL ? MINUTE`,
      [JOB_TIMEOUT_MINUTES]
    );
    if (result.affectedRows > 0) {
      console.warn(`[ImportWorker] 🧹 Membersihkan ${result.affectedRows} job yang macet/zombie.`);
    }
  } catch (e) {
    console.error("[ImportWorker] Gagal menjalankan cleanup:", e.message);
  }
}

async function generateErrorFile(originalFilePath, errors, headerRowIndex = 1, jobId) {
  try {
    // Cek file
    if (!fs.existsSync(originalFilePath)) return null;

    const originalWorkbook = new ExcelJS.Workbook();
    const ext = path.extname(originalFilePath).toLowerCase();

    // Setup options
    const readOptions = {
      parserOptions: {
        delimiter: ",",
        quote: '"',
        relax_column_count: true,
        cast: false,
        map: (val) => val,
      },
      map: (val) => val,
    };

    if (ext === ".csv") {
      await originalWorkbook.csv.readFile(originalFilePath, readOptions);
    } else {
      await originalWorkbook.xlsx.readFile(originalFilePath);
    }

    const originalSheet = originalWorkbook.worksheets[0];
    if (!originalSheet) return null;

    const errorWorkbook = new ExcelJS.Workbook();
    const errorSheet = errorWorkbook.addWorksheet("Perbaikan Data");

    const headerRow = originalSheet.getRow(headerRowIndex);
    errorSheet.getRow(1).values = headerRow.values;

    const errorColIdx = headerRow.cellCount + 1;
    const errorHeaderCell = errorSheet.getRow(1).getCell(errorColIdx);
    errorHeaderCell.value = "SYSTEM ERROR MESSAGE";
    errorHeaderCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    errorHeaderCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFCC0000" },
    };

    const errorMap = new Map();
    errors.forEach((e) => {
      if (e.row) errorMap.set(e.row, e.message);
    });

    console.log(`[ImportWorker] Generate Error File: ${errors.length} total errors, ${errorMap.size} mapped to rows.`);


    let targetRowIdx = 2;
    const sortedRowIndices = Array.from(errorMap.keys()).sort((a, b) => a - b);

    sortedRowIndices.forEach((sourceRowIdx) => {
      const msg = errorMap.get(sourceRowIdx);
      const sourceRow = originalSheet.getRow(sourceRowIdx);
      const targetRow = errorSheet.getRow(targetRowIdx);

      sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let safeValue = cell.value;
        if (safeValue !== null && safeValue !== undefined) {
          safeValue = String(safeValue);
        }
        const targetCell = targetRow.getCell(colNumber);
        targetCell.value = safeValue;
        targetCell.numFmt = "@";
      });

      const errorCell = targetRow.getCell(errorColIdx);
      errorCell.value = msg;

      if (msg && msg.includes("⚠️")) {
        errorCell.font = { color: { argb: "FF777777" }, italic: true };
      } else {
        errorCell.font = { color: { argb: "FFFF0000" }, bold: true };
      }

      targetRow.commit();
      targetRowIdx++;
    });

    const filename = `error_fix_job_${jobId}_${Date.now()}.xlsx`;
    const outputPath = path.join(EXPORT_DIR, filename);

    await errorWorkbook.xlsx.writeFile(outputPath);
    return `/uploads/exports/${filename}`;
  } catch (err) {
    console.error("[ImportWorker] Failed to generate error file:", err);
    return null;
  }
}

function isRetriableError(error) {
  const msg = (error.message || "").toLowerCase();
  if (msg.includes("deadlock") || msg.includes("lock wait timeout")) return true;
  if (msg.includes("connection lost") || msg.includes("econreset") || msg.includes("etimedout"))
    return true;
  if (msg.includes("protocol_connection_lost")) return true;
  if (msg.includes("too many connections")) return true;
  return false;
}

// --- MAIN WORKER LOGIC ---

export const importQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // 0. SELF-HEALING
    await cleanupStuckJobs(connection);

    // 1. Ambil Job
    const job = await jobRepo.getPendingImportJob(connection);

    if (!job) {
      connection.release();
      return;
    }

    jobId = job.id;

    // Lock Job
    await jobRepo.lockImportJob(connection, jobId);
    connection.release();

    // ✅ FIX PATH: Resolve path absolute agar FS bisa baca
    let absoluteFilePath = job.file_path;
    if (!path.isAbsolute(absoluteFilePath)) {
      absoluteFilePath = path.resolve(__dirname, "../..", absoluteFilePath);
    }

    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`File fisik tidak ditemukan di server: ${absoluteFilePath}`);
    }

    const retryInfo = job.retry_count > 0 ? `(Retry #${job.retry_count})` : "";
    console.log(`[ImportWorker] Starting Job ${jobId} ${retryInfo}: ${job.job_type}`);
    console.log(`[ImportWorker] Processing File: ${absoluteFilePath}`);

    connection = await db.getConnection();
    let logSummary = "";
    let errors = [];
    let processStats = {};
    let headerRowIndex = 1;
    let isPartialSuccess = false;
    let nextOptions = null;

    // Parse options
    let jobOptions = {};
    try {
      if (job.options)
        jobOptions = typeof job.options === "string" ? JSON.parse(job.options) : job.options;
    } catch (e) {
      console.warn("Invalid job options JSON", e);
    }

    const updateJobProgress = async (processed, total) => {
      try {
        await jobRepo.updateProgress(connection, jobId, processed, total);
      } catch (e) { }
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
        isDryRun
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
      logSummary = `${modeText}Selesai ${source}. DB Update: ${syncResult.updatedCount || 0
        } Invoice.`;
    } else if (realJobType === "ADJUST_STOCK") {
      const result = await processStockImport(
        connection,
        absoluteFilePath,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun
      );
      logSummary = result.logSummary;
      errors = (result.errors || []).map((e) => ({ row: e.row, message: e.message }));
      processStats = result.stats || {};
    } else if (realJobType === "IMPORT_ATTENDANCE") {
      // ✅ Attendance Import: Langsung pass file mentah & metadata via options
      const result = await processAttendanceImport(
        connection,
        absoluteFilePath,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
        jobOptions
      );
      logSummary = result.logSummary;
      errors = result.errors || [];
      processStats = result.stats || {};
    } else if (realJobType === "BATCH_EDIT_PRODUCT" || job.job_type === "BATCH_EDIT_PRODUCT_DRY_RUN") {
      const result = await productImportService.processProductImport(
        connection,
        absoluteFilePath,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
        jobOptions
      );

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
    } else if (realJobType === "IMPORT_PACKAGES") {
      const result = await processPackageImport(
        absoluteFilePath,
        jobId,
        updateJobProgress
      );
      // Package Import returns { successCount, errors }
      logSummary = `Selesai Import Paket. Berhasil: ${result.successCount}.`;
      errors = (result.errors || []).map(e => ({
        row: 0, // Simplified for now as errors are strings
        message: e
      }));
      processStats = { success: result.successCount };
    } else if (realJobType === "IMPORT_STOCK_INBOUND") {
      const result = await stockImportService.processStockInboundImport(
        jobId,
        absoluteFilePath,
        job.user_id
      );
      // Stock Import returns { success: boolean, count: number, errors: [] }
      if (result.success) {
        logSummary = `Selesai Inbound Massal via Excel. Berhasil: ${result.count} items.`;
        processStats = { success: result.count };
        errors = [];
      } else {
        logSummary = "Gagal memproses Inbound Massal.";
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
             SET status = 'PENDING',
                 options = ?,
                 log_summary = ?,
                 updated_at = NOW()
             WHERE id = ?`,
        [nextOptionsStr, pauseMsg, jobId]
      );
      console.log(`[ImportWorker] Job ${jobId} PAUSED (Resumable). Next offset saved.`);
      return;
    }

    let finalStatus = "COMPLETED";
    if (errors.length > 0) {
      finalStatus = "COMPLETED_WITH_ERRORS";
      const errDetail = typeof errors[0] === "object" ? errors[0].message : errors[0];
      logSummary += ` (${errors.length} errors. Contoh: ${errDetail?.substring(0, 50)}...)`;
    }
    if (processStats.success === 0 && errors.length > 0) {
      finalStatus = "FAILED";
    }

    let downloadUrl = null;
    if (errors.length > 0) {
      // Note: generateErrorFile mungkin tidak sempurna untuk file absensi karena struktur headernya beda,
      // tapi kita biarkan saja sebagai best effort.
      downloadUrl = await generateErrorFile(absoluteFilePath, errors, headerRowIndex, jobId);
    }

    let errorLogJSON = null;
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        summary: logSummary,
        download_url: downloadUrl,
        download_url: downloadUrl,
        errors: errors.length > 50 ? errors.slice(0, 50).concat([{ message: `... and ${errors.length - 50} more errors. See download file.` }]) : errors,
      };
      errorLogJSON = JSON.stringify(payload);
    } catch (e) {
      errorLogJSON = JSON.stringify({ message: "Error log format invalid" });
    }

    if (processStats.success > 0 || finalStatus === "COMPLETED") {
      const total = processStats.success + (errors.length || 0);
      await jobRepo.updateProgress(connection, jobId, total, total);
    }

    await jobRepo.completeImportJob(connection, jobId, finalStatus, logSummary, errorLogJSON);

    // Hapus file
    if (fs.existsSync(absoluteFilePath)) {
      try {
        fs.unlinkSync(absoluteFilePath);
      } catch (err) { }
    }

    console.log(`[ImportWorker] Job ${jobId} Finished: ${finalStatus} (DryRun: ${isDryRun})`);
  } catch (error) {
    console.error(`[ImportWorker] Job ${jobId} CRASHED:`, error);

    if (jobId && connection) {
      try {
        const jobQuery = await connection.query(
          "SELECT retry_count FROM import_jobs WHERE id = ?",
          [jobId]
        );
        const currentRetry = jobQuery[0][0]?.retry_count || 0;

        if (isRetriableError(error) && currentRetry < MAX_RETRIES) {
          console.warn(`[ImportWorker] Transient Error. Scheduling Retry #${currentRetry + 1}...`);
          await jobRepo.retryImportJob(connection, jobId, currentRetry, error.message);
        } else {
          await jobRepo.failImportJob(
            connection,
            jobId,
            `CRASH: ${error.message.substring(0, 255)}`
          );
        }
      } catch (e) {
        console.error("Gagal update status CRASH/RETRY ke DB:", e);
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
  console.log("[ImportWorker] Menjalankan Worker via CLI...");
  importQueue().finally(() => {
    if (db.pool) db.pool.end();
    console.log("[ImportWorker] Proses Selesai.");
    process.exit(0);
  });
}
