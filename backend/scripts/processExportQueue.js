// backend\scripts\processExportQueue.js
import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logDebug } from "../utils/logger.js";

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 15;
const BATCH_SIZE = 1000;
const DELAY_MS = 10;

// --- SETUP PATH ABSOLUT ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simpan di: backend/uploads/exports
const EXPORT_DIR_PATH = path.join(__dirname, "..", "uploads", "exports");

// Pastikan direktori ekspor ada saat inisialisasi
if (!fs.existsSync(EXPORT_DIR_PATH)) {
  try {
    fs.mkdirSync(EXPORT_DIR_PATH, { recursive: true });
    logDebug(`Folder ekspor dibuat di: ${EXPORT_DIR_PATH}`);
  } catch (err) {
    logDebug(`GAGAL membuat folder ekspor: ${err.message}`);
  }
}

// Helper styling header Excel
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
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    cell.font = { bold: true, color: { argb: fontColor } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  row.commit(); // Penting: Melakukan commit pada baris header agar memori dibersihkan
};

// Helper format tanggal untuk nama file
const getFormattedDateTime = () => {
  const now = new Date();
  const Y = now.getFullYear();
  const M = (now.getMonth() + 1).toString().padStart(2, "0");
  const D = now.getDate().toString().padStart(2, "0");
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  return `${Y}-${M}-${D}_${h}-${m}`;
};

/**
 * GENERATOR LAPORAN (STREAMING VERSION)
 */
async function generateStockReportStreaming(filters, filePath) {
  let connection;
  // Gunakan WorkbookWriter untuk streaming ke file
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

    // Ambil Daftar Lokasi Dinamis
    const [locationRows] = await connection.query(
      "SELECT DISTINCT code FROM locations WHERE code IS NOT NULL AND code != '' ORDER BY code ASC"
    );
    const locationCodes = locationRows.map((row) => row.code);

    logDebug(`Ditemukan ${locationCodes.length} lokasi untuk kolom pivot.`);

    // --- Setup Sheet 1: Ringkasan Stok (Pivot) ---
    const pivotSheet = writer.addWorksheet("Ringkasan Stok");

    const pivotHeaderTexts = [
      "SKU",
      "Nama Produk",
      ...locationCodes,
      "Grand Total",
      "Harga Satuan",
      "Total Nilai",
    ];

    // Definisikan Kolom Pivot
    const pivotColumns = [
      { key: "Sku", width: 20 },
      { key: "NamaProduk", width: 50 },
    ];
    locationCodes.forEach((code) => pivotColumns.push({ key: code, width: 10 }));
    pivotColumns.push({ key: "GrandTotal", width: 15 });
    pivotColumns.push({ key: "HargaSatuan", width: 15 });
    pivotColumns.push({ key: "TotalNilai", width: 20 });

    pivotSheet.columns = pivotColumns;

    // --- [FIXED] STEP 1: JUDUL (Baris 1) ---
    // Merge cell dulu sebelum commit
    pivotSheet.mergeCells(1, 1, 1, pivotHeaderTexts.length);
    const titleCell = pivotSheet.getCell("A1");
    titleCell.value = "Laporan Ringkasan Stok (Per Lokasi)";
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: "center" };

    // Commit baris 1 agar stream maju (PENTING)
    pivotSheet.getRow(1).commit();

    // --- [FIXED] STEP 2: HEADER TABLE (Baris 3) ---
    // Kita lewati baris 2 (biarkan kosong), langsung ke baris 3
    const pivotHeaderRow = pivotSheet.getRow(3);
    pivotHeaderRow.values = pivotHeaderTexts;

    // styleHeader melakukan commit pada rowNumber (Baris 3)
    styleHeader(pivotSheet, 3, pivotHeaderTexts.length, "FF4472C4", "FFFFFFFF");

    // --- Setup Sheet 2: Data Mentah ---
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

    // --- Persiapan Query SQL ---
    let whereClauses = ["p.is_active = 1"];
    const queryParams = [];

    // Filter logic
    switch (filters.stockStatus) {
      case "positive":
        whereClauses.push("COALESCE(sl.quantity, 0) > 0");
        break;
      case "negative":
        whereClauses.push("COALESCE(sl.quantity, 0) < 0");
        break;
      case "zero":
        whereClauses.push("COALESCE(sl.quantity, 0) = 0");
        break;
      default:
        whereClauses.push("COALESCE(sl.quantity, 0) > 0"); // Default
    }
    if (filters.building && filters.building !== "all" && filters.building.length > 0) {
      whereClauses.push("l.building IN (?)");
      queryParams.push(filters.building);
    }
    if (filters.searchQuery) {
      whereClauses.push("(p.sku LIKE ? OR p.name LIKE ?)");
      queryParams.push(`%${filters.searchQuery}%`, `%${filters.searchQuery}%`);
    }
    if (filters.purpose) {
      whereClauses.push("l.purpose = ?");
      queryParams.push(filters.purpose);
    }
    if (filters.isPackage !== null && filters.isPackage !== undefined && filters.isPackage !== "") {
      whereClauses.push("p.is_package = ?");
      queryParams.push(filters.isPackage);
    }

    const finalQuery = `
      SELECT
        p.sku AS Sku, p.name AS NamaProduk, l.code AS Lokasi,
        COALESCE(sl.quantity, 0) AS Kuantitas, p.price AS HargaSatuan,
        (COALESCE(sl.quantity, 0) * p.price) AS TotalNilai
      FROM products p
      LEFT JOIN stock_locations sl ON p.id = sl.product_id
      LEFT JOIN locations l ON sl.location_id = l.id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY p.sku, l.code;
    `;

    logDebug("Menjalankan Query SQL...", { query: finalQuery, params: queryParams });

    const pivotData = new Map();
    let rawCounter = 0;

    // --- EKSEKUSI STREAM ---
    const queryStream = connection.connection.query(finalQuery, queryParams).stream();

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

        // Format Cell Raw
        addedRow.getCell(1).numFmt = textFormat; // SKU
        addedRow.getCell(4).numFmt = numberFormat; // Qty
        if (Number(row.Kuantitas) < 0) addedRow.getCell(4).font = negativeRedText.font;
        addedRow.getCell(5).numFmt = currencyFormat; // Harga
        addedRow.getCell(6).numFmt = currencyFormat; // Total

        // Commit baris raw sesekali agar tidak menumpuk di memori
        addedRow.commit();

        // Agregasi Pivot (Simpan di Map)
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
          logDebug(`Stream SQL selesai. Total baris raw: ${rawCounter}`);

          if (rawCounter === 0) {
            logDebug("PERINGATAN: Query mengembalikan 0 hasil. File Excel mungkin kosong isinya.");
          }

          // Commit Raw Sheet selesai
          rawSheet.commit();

          // Tulis Pivot Sheet dari Map
          logDebug(`Menulis ${pivotData.size} baris pivot ke Excel...`);

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

            // Format Cell Pivot
            addedRow.getCell(1).numFmt = textFormat; // SKU

            let colIdx = 3;
            locationCodes.forEach(() => {
              const cell = addedRow.getCell(colIdx);
              cell.numFmt = numberFormat;
              if (Number(cell.value) < 0) cell.font = negativeRedText.font;
              colIdx++;
            });

            // Grand Total
            const grandTotalCell = addedRow.getCell(colIdx);
            grandTotalCell.numFmt = numberFormat;
            grandTotalCell.font = { bold: true };
            if (data.GrandTotalKuantitas < 0)
              grandTotalCell.font = { bold: true, ...negativeRedText.font };
            colIdx++;

            // Harga & Total Nilai
            addedRow.getCell(colIdx).numFmt = currencyFormat;
            addedRow.getCell(colIdx + 1).numFmt = currencyFormat;

            addedRow.commit();
          }

          pivotSheet.commit();
          await writer.commit();

          logDebug("File Excel berhasil di-commit dan ditutup.");
          resolve();
        } catch (err) {
          logDebug("Error saat finalisasi Excel", err.message);
          reject(err);
        } finally {
          if (connection) connection.release();
        }
      });
    });
  } catch (error) {
    logDebug("Critical Error di fungsi generateStockReportStreaming", error.message);
    if (writer) {
      try {
        await writer.abort();
      } catch (e) {}
    }
    if (connection) connection.release();
    throw error;
  }
}

/**
 * FUNGSI UTAMA PROCESS QUEUE
 */
export const processQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // Clean Up Pekerjaan Macet
    const [timeoutResult] = await connection.query(
      `UPDATE export_jobs
       SET status = 'FAILED', error_message = 'Job timeout after ${JOB_TIMEOUT_MINUTES} minutes'
       WHERE status = 'PROCESSING'
       AND processing_started_at < NOW() - INTERVAL ${JOB_TIMEOUT_MINUTES} MINUTE`
    );

    // Ambil Pekerjaan PENDING
    const [jobs] = await connection.query(
      `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1`
    );

    if (jobs.length === 0) return;

    jobId = jobs[0].id;
    logDebug(`Memulai Export Job ID: ${jobId}`);

    // Update Status -> PROCESSING
    await connection.query(
      "UPDATE export_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?",
      [jobId]
    );

    // Siapkan Path File
    const dateStr = getFormattedDateTime();
    const fileName = `Laporan_Stok_${dateStr}_(Job-${jobId}).xlsx`;
    const filePath = path.join(EXPORT_DIR_PATH, fileName);

    const filters = JSON.parse(jobs[0].filters || "{}");
    logDebug("Filters:", filters);

    // GENERATE REPORT
    await generateStockReportStreaming(filters, filePath);

    // Verifikasi File
    let fileSize = 0;
    try {
      const stats = fs.statSync(filePath);
      fileSize = stats.size;
      logDebug(`File berhasil dibuat. Ukuran: ${(fileSize / 1024).toFixed(2)} KB`);
    } catch (e) {
      logDebug(`PERINGATAN: File tidak ditemukan setelah generate! Path: ${filePath}`);
    }

    if (fileSize === 0) {
      throw new Error("File Excel yang dihasilkan kosong (0 bytes).");
    }

    // Update Status -> COMPLETED
    await connection.query(
      "UPDATE export_jobs SET status = 'COMPLETED', file_path = ? WHERE id = ?",
      [fileName, jobId]
    );
    logDebug(`Job ID ${jobId} SELESAI.`);
  } catch (error) {
    logDebug(`Job ID ${jobId} GAGAL: ${error.message}`);
    if (jobId && connection) {
      try {
        await connection.query(
          "UPDATE export_jobs SET status = 'FAILED', error_message = ? WHERE id = ?",
          [error.message.substring(0, 255), jobId]
        );
      } catch (dbError) {
        console.error("Fatal DB Error saat update FAILED:", dbError);
      }
    }
  } finally {
    if (connection) connection.release();
  }
};

// Mode Standalone untuk Testing
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

export default processQueue;
