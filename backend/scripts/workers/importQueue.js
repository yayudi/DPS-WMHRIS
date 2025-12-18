// backend/scripts/importQueue.js
import db from "../../config/db.js";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import { ParserEngine } from "../../services/parsers/ParserEngine.js";

import { syncOrdersToDB } from "../../services/pickingImportService.js";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";
import * as productRepo from "../../repositories/productRepository.js";
import * as locationRepo from "../../repositories/locationRepository.js";
import * as stockRepo from "../../repositories/stockMovementRepository.js";

// --- KONFIGURASI & PATH ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, "..", "uploads", "exports");

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

/**
 * REFACTORED: Memproses file Stock Opname dengan Dukungan Paket
 */
async function processStockAdjustmentFile(job, connection) {
  console.log(`[ImportWorker] Memulai Stock Adjustment: ${job.original_filename}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.file_path);
  const worksheet = workbook.getWorksheet("Input Stok");

  if (!worksheet) throw new Error("Sheet 'Input Stok' tidak ditemukan dalam file Excel.");

  const rowCount = worksheet.rowCount;
  const rawItems = [];

  // Baca semua baris valid dulu
  for (let i = 2; i <= rowCount; i++) {
    const row = worksheet.getRow(i);
    if (row.values.length === 0) continue;

    const sku = row.getCell("A").value?.toString().trim();
    const locCode = row.getCell("B").value?.toString().trim();
    const newQty = parseInt(row.getCell("C").value, 10);
    const notes = row.getCell("D").value?.toString().trim();

    if (sku && locCode && !isNaN(newQty)) {
      rawItems.push({ rowIdx: i, sku, locCode, newQty, notes });
    }
  }

  if (rawItems.length === 0) {
    return {
      logSummary: "File kosong atau format salah.",
      errors: [],
      stats: { success: 0, failed: 0 },
    };
  }

  // Pre-fetch Product Info untuk Cek Paket
  const allSkus = new Set(rawItems.map((i) => i.sku));
  const productMap = await productRepo.getProductMapWithComponents(connection, Array.from(allSkus));

  let successCounter = 0;
  const errors = [];

  await connection.beginTransaction();
  try {
    for (const item of rawItems) {
      const product = productMap.get(item.sku);

      // Validasi Dasar
      if (!product) {
        errors.push({
          row: item.rowIdx,
          sku: item.sku,
          message: `SKU ${item.sku} tidak ditemukan.`,
        });
        continue;
      }

      // Validasi Lokasi
      const locationId = await locationRepo.getIdByCode(connection, item.locCode);
      if (!locationId) {
        errors.push({
          row: item.rowIdx,
          sku: item.sku,
          message: `Lokasi ${item.locCode} tidak ditemukan.`,
        });
        continue;
      }

      // Logic Breakdown Paket vs Single
      let itemsToProcess = [];

      if (product.is_package) {
        if (!product.components || product.components.length === 0) {
          errors.push({
            row: item.rowIdx,
            sku: item.sku,
            message: `Paket ${item.sku} tidak memiliki komponen.`,
          });
          continue;
        }

        // Breakdown ke komponen
        itemsToProcess = product.components.map((comp) => ({
          productId: comp.id,
          qty: item.newQty * comp.qty_ratio, // Qty Paket * Ratio
          isComponent: true,
          originalSku: item.sku,
        }));
      } else {
        // Single Item
        itemsToProcess.push({
          productId: product.id,
          qty: item.newQty,
          isComponent: false,
        });
      }

      // Eksekusi DB
      for (const proc of itemsToProcess) {
        // REPO: Update Stok (Upsert - Absolute Set)
        // Catatan: Jika ini Opname, kita menimpa nilai stok.
        // Jika Paket di-opname, kita meng-override stok komponen sesuai hitungan paket.
        await locationRepo.upsertStock(connection, proc.productId, locationId, proc.qty);

        // REPO: Catat Movement
        const noteText = proc.isComponent
          ? `Opname Paket ${proc.originalSku}: ${item.notes || "-"}`
          : `Opname: ${item.notes || "-"}`;

        await stockRepo.createLog(connection, {
          productId: proc.productId,
          quantity: Math.abs(proc.qty),
          toLocationId: locationId,
          type: "ADJUST_OPNAME",
          userId: job.user_id,
          notes: noteText,
        });
      }

      successCounter++;
    }
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  }

  if (fs.existsSync(job.file_path)) fs.unlinkSync(job.file_path);

  return {
    logSummary: `Adjustment Selesai: ${successCounter} baris diproses (Paket dipecah otomatis).`,
    errors: errors,
    stats: { success: successCounter, failed: errors.length },
  };
}

// --- MAIN WORKER LOGIC ---

export const importQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // REPO: Ambil Job Pending
    const job = await jobRepo.getPendingImportJob(connection);

    if (!job) {
      connection.release();
      return;
    }

    jobId = job.id;

    // REPO: Lock Job
    await jobRepo.lockImportJob(connection, jobId);
    connection.release();

    console.log(`[ImportWorker] Starting Job ${jobId} (${job.job_type})`);

    connection = await db.getConnection(); // Koneksi baru untuk proses berat
    let logSummary = "";
    let errors = [];
    let processStats = {};
    let headerRowIndex = 1;

    if (job.job_type.startsWith("IMPORT_SALES_")) {
      const sourceMap = {
        IMPORT_SALES_TOKOPEDIA: "Tokopedia",
        IMPORT_SALES_SHOPEE: "Shopee",
        IMPORT_SALES_OFFLINE: "Offline",
      };
      const source = sourceMap[job.job_type];
      if (!source) throw new Error(`Unknown Import Type: ${job.job_type}`);

      const parser = new ParserEngine(job.file_path, source);
      const {
        orders: ordersMap = new Map(),
        stats = {},
        errors: parserErrors = [],
        headerRowIndex: hIdx = 1,
      } = await parser.run();

      headerRowIndex = hIdx;
      for (const order of ordersMap.values()) {
        order.source = source;
      }

      const syncResult = await syncOrdersToDB(
        connection,
        ordersMap,
        job.user_id,
        job.original_filename
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

      errors = [...parserErrors, ...logicErrors];
      processStats = stats;
      logSummary = `Selesai ${source}. Scan: ${stats.totalRows || 0} baris. DB Update: ${
        syncResult.updatedCount
      } Invoice.`;
    } else if (job.job_type === "ADJUST_STOCK") {
      const result = await processStockAdjustmentFile(job, connection);
      logSummary = result.logSummary;
      errors = result.errors || [];
      processStats = result.stats || {};
    } else {
      throw new Error(`Job Type tidak dikenal: ${job.job_type}`);
    }

    // Finalisasi Status
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
    if (errors.length > 0 && job.job_type.startsWith("IMPORT_SALES_")) {
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

    // REPO: Complete Job
    await jobRepo.completeImportJob(connection, jobId, finalStatus, logSummary, errorLogJSON);

    if (fs.existsSync(job.file_path)) {
      try {
        fs.unlinkSync(job.file_path);
      } catch (err) {
        console.warn(`Gagal hapus file: ${job.file_path}`);
      }
    }

    console.log(`[ImportWorker] Job ${jobId} Finished: ${finalStatus}`);
  } catch (error) {
    console.error(`[ImportWorker] Job ${jobId} CRASHED:`, error);
    if (jobId && connection) {
      try {
        // REPO: Fail Job
        await jobRepo.failImportJob(connection, jobId, `CRASH: ${error.message.substring(0, 255)}`);
      } catch (e) {
        console.error("Gagal mencatat CRASH ke DB:", e);
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
