// backend\scripts\processImportQueue.js
import db from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ParserEngine } from "../services/ParserEngine.js";
import { syncOrdersToDB } from "../services/importSyncService.js";
import ExcelJS from "exceljs";

// --- KONFIGURASI & PATH ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastikan path EXPORT_DIR selalu absolut dan konsisten di server manapun
const EXPORT_DIR = path.join(__dirname, "..", "uploads", "exports");

// Inisialisasi folder export jika belum ada
if (!fs.existsSync(EXPORT_DIR)) {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    console.log(`[ImportWorker] Direktori export dibuat: ${EXPORT_DIR}`);
  } catch (err) {
    console.error(`[ImportWorker] Gagal membuat direktori export: ${err.message}`);
  }
}

// --- HELPER FUNCTIONS ---

/**
 * Menghasilkan file Excel berisi baris-baris yang gagal untuk diperbaiki user.
 * Menggunakan mode 'Text' ketat untuk menjaga integritas ID panjang (18+ digit).
 */
async function generateErrorFile(originalFilePath, errors, headerRowIndex = 1, jobId) {
  try {
    console.log(`[ImportWorker] Generating Error Correction File for Job ${jobId}...`);

    const originalWorkbook = new ExcelJS.Workbook();
    const ext = path.extname(originalFilePath).toLowerCase();

    // Konfigurasi pembacaan file yang ketat (mencegah auto-casting angka)
    const readOptions = {
      parserOptions: {
        delimiter: ",",
        quote: '"',
        relax_column_count: true,
        cast: false, // PENTING: Matikan konversi angka otomatis
        map: (val) => val, // Paksa return sebagai string mentah
      },
      map: (val) => val,
    };

    if (ext === ".csv") {
      await originalWorkbook.csv.readFile(originalFilePath, readOptions);
    } else {
      await originalWorkbook.xlsx.readFile(originalFilePath);
    }

    const originalSheet = originalWorkbook.worksheets[0];
    if (!originalSheet) {
      console.error("[ImportWorker] Sheet asli tidak ditemukan.");
      return null;
    }

    // Persiapkan Workbook Baru
    const errorWorkbook = new ExcelJS.Workbook();
    const errorSheet = errorWorkbook.addWorksheet("Perbaikan Data");

    // Salin Header
    const headerRow = originalSheet.getRow(headerRowIndex);
    errorSheet.getRow(1).values = headerRow.values;

    // Tambah Kolom Pesan Error
    const errorColIdx = headerRow.cellCount + 1;
    const errorHeaderCell = errorSheet.getRow(1).getCell(errorColIdx);
    errorHeaderCell.value = "SYSTEM ERROR MESSAGE";
    errorHeaderCell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    errorHeaderCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFCC0000" }, // Merah Gelap
    };

    // Mapping Error ke Map untuk akses cepat
    const errorMap = new Map();
    errors.forEach((e) => {
      if (e.row) errorMap.set(e.row, e.message);
    });

    // Salin Baris Error (Urutkan berdasarkan nomor baris)
    let targetRowIdx = 2;
    const sortedRowIndices = Array.from(errorMap.keys()).sort((a, b) => a - b);

    sortedRowIndices.forEach((sourceRowIdx) => {
      const msg = errorMap.get(sourceRowIdx);
      const sourceRow = originalSheet.getRow(sourceRowIdx);
      const targetRow = errorSheet.getRow(targetRowIdx);

      // Salin nilai sel satu per satu dengan format Text Eksplisit
      sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const targetCell = targetRow.getCell(colNumber);

        // Konversi ke string aman
        let safeValue = cell.value;
        if (safeValue !== null && safeValue !== undefined) {
          safeValue = String(safeValue);
        }

        targetCell.value = safeValue;
        targetCell.numFmt = "@"; // Format TEXT Excel ('@')
      });

      // Tulis Pesan Error
      const errorCell = targetRow.getCell(errorColIdx);
      errorCell.value = msg;

      // Visualisasi: Merah (Error Utama) vs Abu-abu (Item Ikutan)
      if (msg && msg.includes("⚠️")) {
        errorCell.font = { color: { argb: "FF777777" }, italic: true };
      } else {
        errorCell.font = { color: { argb: "FFFF0000" }, bold: true };
      }

      targetRow.commit();
      targetRowIdx++;
    });

    // Simpan File
    const filename = `error_fix_job_${jobId}_${Date.now()}.xlsx`;
    const outputPath = path.join(EXPORT_DIR, filename);

    await errorWorkbook.xlsx.writeFile(outputPath);
    console.log(`[ImportWorker] Error File Generated: ${outputPath}`);

    // Return path relative untuk diakses via URL (sesuai konfigurasi server.js)
    return `/uploads/exports/${filename}`;
  } catch (err) {
    console.error("[ImportWorker] Failed to generate error file:", err);
    return null;
  }
}

/**
 * Memproses file Stock Opname (Manual Adjustment)
 */
async function processStockAdjustmentFile(job, connection) {
  console.log(`[ImportWorker] Memulai Stock Adjustment: ${job.original_filename}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.file_path);
  const worksheet = workbook.getWorksheet("Input Stok");

  if (!worksheet) throw new Error("Sheet 'Input Stok' tidak ditemukan dalam file Excel.");

  const rowCount = worksheet.rowCount;
  let successCounter = 0;
  const errors = [];

  await connection.beginTransaction();
  try {
    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);
      if (row.values.length === 0) continue;

      // Baca data sel
      const sku = row.getCell("A").value?.toString().trim();
      const locCode = row.getCell("B").value?.toString().trim();
      const newQty = parseInt(row.getCell("C").value, 10);
      const notes = row.getCell("D").value?.toString().trim();

      if (!sku || !locCode || isNaN(newQty)) continue;

      // Validasi DB
      const [prod] = await connection.query("SELECT id FROM products WHERE sku=?", [sku]);
      const [loc] = await connection.query("SELECT id FROM locations WHERE code=?", [locCode]);

      if (prod.length === 0) {
        errors.push({ row: i, sku: sku, message: `SKU ${sku} tidak ditemukan.` });
        continue;
      }
      if (loc.length === 0) {
        errors.push({ row: i, sku: sku, message: `Lokasi ${locCode} tidak ditemukan.` });
        continue;
      }

      const productId = prod[0].id;
      const locationId = loc[0].id;

      // Update Stok & Catat Movement
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=?",
        [productId, locationId, newQty, newQty]
      );

      // Hitung selisih stok (opsional, jika ingin logic lebih kompleks) atau catat adjustment absolut
      // Di sini kita catat adjustment absolut
      // Untuk movement quantity, idealnya kita hitung selisih (new - old), tapi di kode existing pakai Math.abs(newQty).
      // Kita pertahankan logika existing agar tidak mengubah behavior bisnis.
      await connection.query(
        `INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes)
         VALUES (?, ?, ?, 'ADJUST_OPNAME', ?, ?)`,
        [productId, Math.abs(newQty), locationId, job.user_id, `Opname: ${notes || "-"}`]
      );

      successCounter++;
    }
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  }

  // Bersihkan file
  if (fs.existsSync(job.file_path)) fs.unlinkSync(job.file_path);

  return {
    logSummary: `Adjustment Selesai: ${successCounter} item diupdate.`,
    errors: errors,
    stats: { success: successCounter, failed: errors.length },
  };
}

// --- MAIN WORKER LOGIC ---

export const processImportQueue = async () => {
  let connection;
  let jobId = null;

  try {
    // Ambil Job Pending (FIFO)
    connection = await db.getConnection();
    const [jobs] = await connection.query(
      `SELECT * FROM import_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1`
    );

    if (jobs.length === 0) {
      connection.release();
      return;
    }

    const job = jobs[0];
    jobId = job.id;

    // Lock Job
    await connection.query(
      "UPDATE import_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?",
      [jobId]
    );
    connection.release(); // Lepas koneksi sebentar

    console.log(`[ImportWorker] Starting Job ${jobId} (${job.job_type})`);

    // Koneksi baru untuk proses berat
    connection = await db.getConnection();
    let logSummary = "";
    let errors = [];
    let processStats = {};
    let headerRowIndex = 1;

    // Routing Logika berdasarkan Job Type
    if (job.job_type.startsWith("IMPORT_SALES_")) {
      const sourceMap = {
        IMPORT_SALES_TOKOPEDIA: "Tokopedia",
        IMPORT_SALES_SHOPEE: "Shopee",
        IMPORT_SALES_OFFLINE: "Offline",
      };
      const source = sourceMap[job.job_type];

      if (!source) throw new Error(`Unknown Import Type: ${job.job_type}`);

      // Parse File
      const parser = new ParserEngine(job.file_path, source);
      const {
        orders: ordersMap = new Map(),
        stats = {},
        errors: parserErrors = [],
        headerRowIndex: hIdx = 1,
      } = await parser.run();

      headerRowIndex = hIdx;

      // Tandai Source
      for (const order of ordersMap.values()) {
        order.source = source;
      }

      // Sync Database
      const syncResult = await syncOrdersToDB(
        connection,
        ordersMap,
        job.user_id,
        job.original_filename
      );

      // --- SMART ERROR MAPPING (Contextual) ---
      // Mengubah error string menjadi error object dengan referensi baris yang akurat
      const logicErrors = [];
      const rawErrors = syncResult.errors || [];

      for (const err of rawErrors) {
        // Jika error sudah punya info baris (dari parser), gunakan langsung
        if (typeof err === "object" && err.row) {
          logicErrors.push(err);
          continue;
        }

        const msg = typeof err === "string" ? err : err.message;

        // Ekstrak Order ID dari pesan error
        const match = msg.match(/Order\s+([a-zA-Z0-9\-\_]+)/);

        if (match) {
          const orderId = match[1];
          const orderData = ordersMap.get(orderId);

          // Jika Order ditemukan, masukkan SEMUA ITEM dalam order tersebut ke list error
          if (orderData && Array.isArray(orderData.items)) {
            // Coba cari SKU spesifik yang bermasalah dari pesan error
            const skuMatch = msg.match(/SKU\s+([^\s]+)/);
            const failedSku = skuMatch ? skuMatch[1] : null;

            // Iterasi semua item dalam satu order
            orderData.items.forEach((item) => {
              let finalMsg = "";

              // Tentukan apakah ini item penyebab error atau item ikutan
              // (Jika failedSku tidak terdeteksi, tapi order cuma 1 item, anggap item itu penyebabnya)
              const isCulprit =
                (failedSku && item.sku === failedSku) ||
                (!failedSku && orderData.items.length === 1);

              if (isCulprit) {
                const marketplaceInfo = item.marketplace_sku
                  ? `(Ref SKU ID: ${item.marketplace_sku})`
                  : "";
                finalMsg = `❌ ${msg} ${marketplaceInfo}`;
              } else {
                finalMsg = `⚠️ Order skipped. Error in sibling item: ${failedSku || "other"}`;
              }

              logicErrors.push({
                row: item.row,
                message: finalMsg,
              });
            });

            continue; // Lanjut ke error berikutnya
          }
        }

        // Fallback jika Order ID tidak ditemukan
        logicErrors.push({ message: msg });
      }

      // Gabungkan semua error
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

    // Tentukan Status Akhir
    let finalStatus = "COMPLETED";

    if (errors.length > 0) {
      finalStatus = "COMPLETED_WITH_ERRORS";
      const errDetail = typeof errors[0] === "object" ? errors[0].message : errors[0];
      logSummary += ` (${errors.length} errors. Contoh: ${errDetail?.substring(0, 50)}...)`;
    }

    if (processStats.success === 0 && errors.length > 0) {
      finalStatus = "FAILED";
    }

    // Generate File Error (Jika ada error dan tipe job relevan)
    let downloadUrl = null;
    if (errors.length > 0 && job.job_type.startsWith("IMPORT_SALES_")) {
      downloadUrl = await generateErrorFile(job.file_path, errors, headerRowIndex, jobId);
    }

    // Simpan Hasil ke DB
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
      console.error("Gagal stringify error log", e);
      errorLogJSON = JSON.stringify({ message: "Error log format invalid" });
    }

    await connection.query(
      `UPDATE import_jobs
       SET status = ?,
           log_summary = ?,
           error_log = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [finalStatus, logSummary, errorLogJSON, jobId]
    );

    // Bersihkan File Asli
    if (fs.existsSync(job.file_path)) {
      try {
        fs.unlinkSync(job.file_path);
      } catch (err) {
        console.warn(`Gagal menghapus file: ${job.file_path}`, err.message);
      }
    }

    console.log(`[ImportWorker] Job ${jobId} Finished: ${finalStatus}`);
  } catch (error) {
    // Handler Crash Fatal
    console.error(`[ImportWorker] Job ${jobId} CRASHED:`, error);
    if (jobId && connection) {
      try {
        await connection.query(
          "UPDATE import_jobs SET status = 'FAILED', log_summary = ?, updated_at = NOW() WHERE id = ?",
          [`CRASH: ${error.message.substring(0, 255)}`, jobId]
        );
      } catch (e) {
        console.error("Gagal mencatat CRASH error ke DB:", e);
      }
    }
  } finally {
    if (connection) connection.release();
  }
};

// --- CLI RUNNER ---
if (
  import.meta.url.startsWith("file://") &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1])
) {
  console.log("[ImportWorker] Menjalankan Worker via CLI...");
  processImportQueue().finally(() => {
    if (db.pool) db.pool.end();
    console.log("[ImportWorker] Proses Selesai.");
    process.exit(0);
  });
}
