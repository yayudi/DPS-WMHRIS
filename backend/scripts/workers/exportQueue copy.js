// backend/scripts/exportQueue.js
import db from "../../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logDebug } from "../../utils/logger.js";

// REPOSITORIES
import * as jobRepo from "../../repositories/jobRepository.js";
import * as locationRepo from "../../repositories/locationRepository.js";
import * as reportRepo from "../../repositories/reportRepository.js";

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 15;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR_PATH = path.join(__dirname, "..", "uploads", "exports");

if (!fs.existsSync(EXPORT_DIR_PATH)) {
  try {
    fs.mkdirSync(EXPORT_DIR_PATH, { recursive: true });
    logDebug(`Folder ekspor dibuat di: ${EXPORT_DIR_PATH}`);
  } catch (err) {
    logDebug(`GAGAL membuat folder ekspor: ${err.message}`);
  }
}

const styleHeader = (
  worksheet,
  rowNumber,
  colCount,
  bgColor = "FFD9E1F2",
  fontColor = "FF000000"
) => {
  const row = worksheet.getRow(rowNumber);
  row.height = 20;
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.font = { bold: true, color: { argb: fontColor } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  row.commit();
};

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

async function generateStockReportStreaming(filters, filePath) {
  let connection;
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: true,
    useSharedStrings: true,
  });
  const negativeRedText = { font: { color: { argb: "FF9C0006" } } };
  const currencyFormat = '"Rp"#,##0.00';
  const numberFormat = "#,##0";
  const textFormat = "@";

  try {
    connection = await db.getConnection();

    // REPO: Ambil Daftar Lokasi (Refactored)
    const locationCodes = await locationRepo.getAllLocationCodes(connection);
    logDebug(`Ditemukan ${locationCodes.length} lokasi untuk kolom pivot.`);

    // --- Setup Excel Headers (Pivot & Raw) ---
    const pivotSheet = writer.addWorksheet("Ringkasan Stok");
    const pivotHeaderTexts = [
      "SKU",
      "Nama Produk",
      ...locationCodes,
      "Grand Total",
      "Harga Satuan",
      "Total Nilai",
    ];
    const pivotColumns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
    ];
    locationCodes.forEach((code) => pivotColumns.push({ key: code, width: 10 }));
    pivotColumns.push(
      { key: "GrandTotal", width: 15 },
      { key: "HargaSatuan", width: 15 },
      { key: "TotalNilai", width: 20 }
    );
    pivotSheet.columns = pivotColumns;

    pivotSheet.mergeCells(1, 1, 1, pivotHeaderTexts.length);
    const titleCell = pivotSheet.getCell("A1");
    titleCell.value = "Laporan Ringkasan Stok (Per Lokasi)";
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: "center" };
    pivotSheet.getRow(1).commit();

    const pivotHeaderRow = pivotSheet.getRow(3);
    pivotHeaderRow.values = pivotHeaderTexts;
    styleHeader(pivotSheet, 3, pivotHeaderTexts.length, "FF4472C4", "FFFFFFFF");

    const rawSheet = writer.addWorksheet("Data Mentah");
    const rawHeaderTexts = [
      "SKU",
      "Nama Produk",
      "Lokasi",
      "Kuantitas",
      "Harga Satuan",
      "Total Nilai",
    ];
    rawSheet.columns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
      { key: "Lokasi", width: 15 },
      { key: "Kuantitas", width: 12 },
      { key: "HargaSatuan", width: 15 },
      { key: "TotalNilai", width: 15 },
    ];
    rawSheet.getRow(1).values = rawHeaderTexts;
    styleHeader(rawSheet, 1, 6, "FFD9E1F2", "FF000000");

    // REPO: Ambil Stream Data (Refactored)
    const queryStream = reportRepo.getStockReportStream(connection, filters);

    const pivotData = new Map();
    let rawCounter = 0;

    return new Promise((resolve, reject) => {
      queryStream.on("error", (err) => {
        logDebug("SQL Stream Error", err.message);
        reject(err);
      });

      queryStream.on("data", (row) => {
        // Tulis ke Raw Sheet
        const rowArray = [
          row.Sku,
          row.NamaProduk,
          row.Lokasi || "-",
          row.Kuantitas,
          row.HargaSatuan,
          row.TotalNilai,
        ];
        const addedRow = rawSheet.addRow(rowArray);
        addedRow.getCell(1).numFmt = textFormat;
        addedRow.getCell(4).numFmt = numberFormat;
        if (Number(row.Kuantitas) < 0) addedRow.getCell(4).font = negativeRedText.font;
        addedRow.getCell(5).numFmt = currencyFormat;
        addedRow.getCell(6).numFmt = currencyFormat;
        addedRow.commit();

        // Agregasi Pivot
        const qty = Number(row.Kuantitas) || 0;
        const val = Number(row.TotalNilai) || 0;
        const price = Number(row.HargaSatuan) || 0;

        if (!pivotData.has(row.Sku)) {
          const newEntry = {
            Sku: row.Sku,
            NamaProduk: row.NamaProduk,
            HargaSatuan: price,
            GrandTotalKuantitas: 0,
            GrandTotalNilai: 0,
          };
          for (const code of locationCodes) newEntry[code] = 0;
          pivotData.set(row.Sku, newEntry);
        }

        const current = pivotData.get(row.Sku);
        if (row.Lokasi && locationCodes.includes(row.Lokasi)) {
          current[row.Lokasi] += qty;
        }
        current.GrandTotalKuantitas += qty;
        current.GrandTotalNilai += val;
        rawCounter++;
      });

      queryStream.on("end", async () => {
        try {
          rawSheet.commit();

          for (const [sku, data] of pivotData) {
            const rowArray = [
              data.Sku,
              data.NamaProduk,
              ...locationCodes.map((code) => (data[code] === 0 ? "" : data[code])),
              data.GrandTotalKuantitas,
              data.HargaSatuan,
              data.GrandTotalNilai,
            ];
            const addedRow = pivotSheet.addRow(rowArray);
            addedRow.getCell(1).numFmt = textFormat;
            let colIdx = 3;
            locationCodes.forEach(() => {
              const cell = addedRow.getCell(colIdx);
              cell.numFmt = numberFormat;
              if (Number(cell.value) < 0) cell.font = negativeRedText.font;
              colIdx++;
            });
            const grandTotalCell = addedRow.getCell(colIdx);
            grandTotalCell.numFmt = numberFormat;
            grandTotalCell.font = { bold: true };
            if (data.GrandTotalKuantitas < 0)
              grandTotalCell.font = { bold: true, ...negativeRedText.font };
            colIdx++;
            addedRow.getCell(colIdx).numFmt = currencyFormat;
            addedRow.getCell(colIdx + 1).numFmt = currencyFormat;
            addedRow.commit();
          }

          pivotSheet.commit();
          await writer.commit();
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          if (connection) connection.release();
        }
      });
    });
  } catch (error) {
    if (writer)
      try {
        await writer.abort();
      } catch (e) {}
    if (connection) connection.release();
    throw error;
  }
}

export const processQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // REPO: Clean Up Stuck Jobs
    await jobRepo.timeoutStuckExportJobs(connection, JOB_TIMEOUT_MINUTES);

    // REPO: Ambil Job Pending
    const job = await jobRepo.getPendingExportJob(connection);
    if (!job) {
      connection.release(); // PENTING: Jangan lupa release jika return early
      return;
    }

    jobId = job.id;
    logDebug(`Memulai Export Job ID: ${jobId}`);

    // REPO: Lock Job
    await jobRepo.lockExportJob(connection, jobId);

    const dateStr = getFormattedDateTime();
    const fileName = `Laporan_Stok_${dateStr}_(Job-${jobId}).xlsx`;
    const filePath = path.join(EXPORT_DIR_PATH, fileName);
    const filters = JSON.parse(job.filters || "{}");

    // GENERATE REPORT (Koneksi untuk generate report dilepas di dalam fungsi generate)
    // Note: generateStockReportStreaming menghandle connection release sendiri jika error/selesai
    await generateStockReportStreaming(filters, filePath);

    let fileSize = 0;
    try {
      const stats = fs.statSync(filePath);
      fileSize = stats.size;
    } catch (e) {}

    if (fileSize === 0) throw new Error("File Excel yang dihasilkan kosong (0 bytes).");

    // REPO: Complete Job (Koneksi perlu diambil lagi jika terputus/released, tapi di sini kita pakai flow synchronous)
    // Namun karena generateStockReportStreaming me-release koneksi, kita butuh koneksi baru untuk update status
    const updateConnection = await db.getConnection();
    try {
      await jobRepo.completeExportJob(updateConnection, jobId, fileName);
    } finally {
      updateConnection.release();
    }

    logDebug(`Job ID ${jobId} SELESAI.`);
  } catch (error) {
    logDebug(`Job ID ${jobId} GAGAL: ${error.message}`);
    if (jobId) {
      try {
        const errConnection = await db.getConnection();
        await jobRepo.failExportJob(errConnection, jobId, error.message.substring(0, 255));
        errConnection.release();
      } catch (dbError) {
        console.error("Fatal DB Error saat update FAILED:", dbError);
      }
    }
  } finally {
    // Koneksi utama sudah di-handle release di generateStockReportStreaming atau di awal
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[Worker] Mode Standalone Aktif");
  processQueue()
    .then(() => {
      console.log("[Worker] Selesai.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Worker] Error:", err);
      process.exit(1);
    });
}
