// backend/scripts/importQueue.js
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
import { processStockImport } from "../../services/stockImportService.js";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";
import * as productRepo from "../../repositories/productRepository.js";
import * as locationRepo from "../../repositories/locationRepository.js";
import * as stockRepo from "../../repositories/stockMovementRepository.js";

// --- KONFIGURASI & PATH ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, "..", "uploads", "exports");

// Konfigurasi Retry
const MAX_RETRIES = 3;

if (!fs.existsSync(EXPORT_DIR)) {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  } catch (err) {
    console.error(`[ImportWorker] Gagal membuat direktori export: ${err.message}`);
  }
}

// --- HELPER FUNCTIONS ---

async function generateErrorFile(originalFilePath, errors, headerRowIndex = 1, jobId) {
  try {
    const originalWorkbook = new ExcelJS.Workbook();
    const ext = path.extname(originalFilePath).toLowerCase();

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
    errorHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCC0000" } };

    const errorMap = new Map();
    errors.forEach((e) => {
      if (e.row) errorMap.set(e.row, e.message);
    });

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

// Helper Deteksi Error Transient (Bisa dicoba ulang)
function isRetriableError(error) {
  const msg = (error.message || "").toLowerCase();

  // 1. Database Deadlocks / Lock Waits
  if (msg.includes("deadlock") || msg.includes("lock wait timeout")) return true;

  // 2. Koneksi Putus
  if (msg.includes("connection lost") || msg.includes("econreset") || msg.includes("etimedout"))
    return true;
  if (msg.includes("protocol_connection_lost")) return true;

  // 3. Too Many Connections
  if (msg.includes("too many connections")) return true;

  // Error logika (e.g., "SKU tidak ditemukan") TIDAK boleh diretry
  return false;
}

// --- MAIN WORKER LOGIC ---

export const importQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // 1. Ambil Job (Pending atau Retrying)
    // Query di repo sudah diupdate untuk menangani delay 10 detik
    const job = await jobRepo.getPendingImportJob(connection);

    if (!job) {
      connection.release();
      return;
    }

    jobId = job.id;

    // Lock Job (Set PROCESSING)
    await jobRepo.lockImportJob(connection, jobId);
    connection.release();

    const retryInfo = job.retry_count > 0 ? `(Retry #${job.retry_count})` : "";
    console.log(`[ImportWorker] Starting Job ${jobId} ${retryInfo}: ${job.job_type}`);

    connection = await db.getConnection(); // Koneksi baru untuk proses berat
    let logSummary = "";
    let errors = [];
    let processStats = {};
    let headerRowIndex = 1;

    // Callback untuk Progress Tracking
    const updateJobProgress = async (processed, total) => {
      try {
        await jobRepo.updateProgress(connection, jobId, processed, total);
      } catch (e) {}
    };

    // Deteksi Dry Run
    const isDryRun = job.job_type.endsWith("_DRY_RUN");
    const realJobType = isDryRun ? job.job_type.replace("_DRY_RUN", "") : job.job_type;

    // --- SWITCH CASE BERDASARKAN TIPE JOB ---
    if (realJobType.startsWith("IMPORT_SALES_")) {
      const sourceMap = {
        IMPORT_SALES_TOKOPEDIA: "Tokopedia",
        IMPORT_SALES_SHOPEE: "Shopee",
        IMPORT_SALES_OFFLINE: "Offline",
      };
      const source = sourceMap[realJobType];
      if (!source) throw new Error(`Unknown Import Type: ${job.job_type}`);

      const parser = new ParserEngine(job.file_path, source);
      const { orders, stats, errors: pErrors, headerRowIndex: hIdx } = await parser.run();
      headerRowIndex = hIdx;

      for (const order of orders.values()) order.source = source;

      // Jalankan Service Picking (Sales Import)
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
        // Flatten error string array
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
      // Panggil Service Stock Import
      const result = await processStockImport(
        connection,
        job.file_path,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun
      );

      logSummary = result.logSummary;
      errors = (result.errors || []).map((e) => ({ row: e.row, message: e.message }));
      processStats = result.stats || {};
    } else if (realJobType === "IMPORT_ATTENDANCE") {
      // Parse Options for Dynamic Mapping
      let mapping = null;
      try {
        if (job.options) {
          mapping = typeof job.options === "string" ? JSON.parse(job.options) : job.options;
        }
      } catch (e) {
        console.warn("Failed to parse job options:", e);
      }

      // Panggil Service Absensi
      const result = await processAttendanceImport(
        connection,
        job.file_path,
        job.user_id,
        job.original_filename,
        updateJobProgress,
        isDryRun,
        mapping // Pass mapping here
      );
      logSummary = result.logSummary;
      errors = result.errors || [];
      processStats = result.stats || {};
    } else {
      throw new Error(`Job Type tidak dikenal: ${job.job_type}`);
    }

    // --- SUCCESS PATH ---

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
    // Generate Error Excel jika ada error
    if (errors.length > 0) {
      // Mendukung error excel untuk semua tipe job yang punya info baris (row)
      // Pastikan generateErrorFile support struktur error array yang dikirim
      downloadUrl = await generateErrorFile(job.file_path, errors, headerRowIndex, jobId);
    }

    let errorLogJSON = null;
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        summary: logSummary,
        download_url: downloadUrl,
        errors: errors,
      };
      errorLogJSON = JSON.stringify(payload);
    } catch (e) {
      errorLogJSON = JSON.stringify({ message: "Error log format invalid" });
    }

    // Pastikan progress 100% saat selesai (jika ada stats success dan tidak gagal total)
    if (processStats.success > 0 || finalStatus === "COMPLETED") {
      const total = processStats.success + (errors.length || 0);
      await jobRepo.updateProgress(connection, jobId, total, total);
    }

    // REPO: Complete Job
    await jobRepo.completeImportJob(connection, jobId, finalStatus, logSummary, errorLogJSON);

    // Hapus file hanya jika SUKSES atau FAILED (bukan retry)
    if (fs.existsSync(job.file_path)) {
      try {
        fs.unlinkSync(job.file_path);
      } catch (err) {}
    }

    console.log(`[ImportWorker] Job ${jobId} Finished: ${finalStatus} (DryRun: ${isDryRun})`);
  } catch (error) {
    console.error(`[ImportWorker] Job ${jobId} CRASHED:`, error);

    // --- SMART RETRY LOGIC ---
    if (jobId && connection) {
      try {
        const job = await connection.query("SELECT retry_count FROM import_jobs WHERE id = ?", [
          jobId,
        ]);
        const currentRetry = job[0][0]?.retry_count || 0;

        // Cek apakah error ini layak diretry DAN belum limit
        if (isRetriableError(error) && currentRetry < MAX_RETRIES) {
          console.warn(
            `[ImportWorker] Transient Error detected. Scheduling Retry #${
              currentRetry + 1
            } in 10s...`
          );

          // Set status RETRYING, update counter, update timestamp
          await jobRepo.retryImportJob(connection, jobId, currentRetry, error.message);

          // PENTING: Jangan hapus file, jangan set FAILED.
          // Worker akan mengambil job ini lagi nanti via getPendingImportJob
        } else {
          // Error Fatal atau sudah limit retry -> FAILED Permanen
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
