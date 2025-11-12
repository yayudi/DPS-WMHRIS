import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url"; // Diperlukan untuk __dirname di ES Modules

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 15;
const BATCH_SIZE = 5000; // Proses 5000 baris...
const DELAY_MS = 20; // ...lalu tidur selama 20md (hemat CPU)
const EXPORT_DIR_NAME = "exports";

// Setup path dengan benar menggunakan import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR_PATH = path.join(
  __dirname, // Menggunakan path skrip saat ini
  "..", // Naik satu level ke 'backend'
  "tmp", // Turun ke 'tmp'
  EXPORT_DIR_NAME // Turun ke 'exports'
);

// Pastikan direktori ekspor ada
if (!fs.existsSync(EXPORT_DIR_PATH)) {
  fs.mkdirSync(EXPORT_DIR_PATH, { recursive: true });
}

// Helper "tidur" untuk throttling CPU
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// [BARU] Helper untuk format tanggal YYYY-MM-DD_HH-mm
const getFormattedDateTime = () => {
  const now = new Date();
  const Y = now.getFullYear();
  const M = (now.getMonth() + 1).toString().padStart(2, "0");
  const D = now.getDate().toString().padStart(2, "0");
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  return `${Y}-${M}-${D}_${h}-${m}`;
};

// Helper styling
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
};

/**
 * Ini adalah versi "Streaming" dari generateStockReport Anda.
 * Didesain untuk RAM rendah dan CPU yang di-throttle.
 */
async function generateStockReportStreaming(filters, filePath) {
  let connection; // Pindahkan deklarasi 'connection' ke scope luar 'try'
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath });

  // [BARU] Definisikan style yang akan kita gunakan
  const defaultBorder = {
    top: { style: "thin", color: { argb: "FFD4D4D4" } },
    left: { style: "thin", color: { argb: "FFD4D4D4" } },
    bottom: { style: "thin", color: { argb: "FFD4D4D4" } },
    right: { style: "thin", color: { argb: "FFD4D4D4" } },
  };
  const negativeRedText = { font: { color: { argb: "FF9C0006" } } };
  const currencyFormat = '"Rp"#,##0.00';
  const numberFormat = "#,##0";
  const textFormat = "@"; // Format sebagai Teks

  try {
    connection = await db.getConnection(); // Dapatkan koneksi

    // --- Inisialisasi Sheet ---
    const pivotSheet = writer.addWorksheet("Ringkasan Stok");
    const rawSheet = writer.addWorksheet("Data Mentah");

    const [locationRows] = await connection.query(
      "SELECT DISTINCT code FROM locations WHERE code IS NOT NULL AND code != '' ORDER BY code ASC"
    );
    const locationCodes = locationRows.map((row) => row.code);

    // --- Setup Sheet 1 (Pivot) ---
    const headerTexts = [
      "SKU",
      "Nama Produk",
      ...locationCodes,
      "Grand Total",
      "Harga Satuan",
      "Total Nilai",
    ];
    const totalColumns = headerTexts.length;

    pivotSheet.mergeCells(1, 1, 1, totalColumns);
    pivotSheet.getCell("A1").value = "Laporan Ringkasan Stok (Per Lokasi)";
    pivotSheet.getCell("A1").font = { size: 16, bold: true };
    pivotSheet.getCell("A1").alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    pivotSheet.getRow(1).height = 30;
    pivotSheet.getRow(2).height = 10;
    pivotSheet.getRow(3).values = headerTexts;
    styleHeader(pivotSheet, 3, totalColumns, "FF4472C4", "FFFFFFFF");

    // Tentukan lebar kolom untuk Pivot Sheet
    const pivotColumns = [
      { key: "Sku", width: 10 },
      { key: "NamaProduk", width: 120 },
    ];
    locationCodes.forEach((code) => {
      pivotColumns.push({ key: code, width: 9 });
    });
    pivotColumns.push({ key: "GrandTotal", width: 10 });
    pivotColumns.push({ key: "HargaSatuan", width: 12 });
    pivotColumns.push({ key: "TotalNilai", width: 10 });
    pivotSheet.columns = pivotColumns;
    // pivotSheet.views = [{ state: "frozen", xSplit: 2, ySplit: 3 }]; // Freeze pane

    // --- Setup Sheet 2 (Raw Data) ---
    const rawHeaderTexts = [
      "SKU",
      "Nama Produk",
      "Lokasi",
      "Kuantitas",
      "Harga Satuan",
      "Total Nilai",
    ];
    rawSheet.getRow(1).values = rawHeaderTexts;
    styleHeader(rawSheet, 1, 6, "FFD9E1F2", "FF000000");

    // Tentukan lebar kolom untuk Raw Sheet
    rawSheet.columns = [
      { key: "Sku", width: 10 },
      { key: "NamaProduk", width: 120 },
      { key: "Lokasi", width: 10 },
      { key: "Kuantitas", width: 10 },
      { key: "HargaSatuan", width: 12 },
      { key: "TotalNilai", width: 12 },
    ];
    // rawSheet.views = [{ state: "frozen", ySplit: 1 }]; // Freeze pane

    // Kunci untuk Agregasi di RAM
    const pivotData = new Map();

    // --- Setup Kueri SQL ---
    let whereClauses = ["p.is_active = 1"];
    const queryParams = [];

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
      case "all":
        break;
      default:
        whereClauses.push("COALESCE(sl.quantity, 0) > 0");
    }
    if (filters.building && filters.building.length > 0) {
      whereClauses.push("l.building IN (?)");
      queryParams.push(filters.building);
    }
    if (filters.searchQuery) {
      whereClauses.push("(p.sku LIKE ? OR p.name LIKE ?)");
      queryParams.push(`%${filters.searchQuery}%`);
      queryParams.push(`%${filters.searchQuery}%`);
    }
    if (filters.purpose) {
      whereClauses.push("l.purpose = ?");
      queryParams.push(filters.purpose);
    }
    if (filters.isPackage !== null && filters.isPackage !== undefined && filters.isPackage !== "") {
      whereClauses.push("p.is_package = ?");
      queryParams.push(filters.isPackage);
    }

    const baseQuery = `
      SELECT
        p.sku AS Sku, p.name AS NamaProduk, l.code AS Lokasi,
        COALESCE(sl.quantity, 0) AS Kuantitas, p.price AS HargaSatuan,
        (COALESCE(sl.quantity, 0) * p.price) AS TotalNilai
      FROM products p
      LEFT JOIN stock_locations sl ON p.id = sl.product_id
      LEFT JOIN locations l ON sl.location_id = l.id
    `;
    const finalQuery = `
      ${baseQuery}
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY p.sku, l.code;
    `;

    console.log("[Worker] Membangun kueri dengan filters:", filters);
    console.log(`[Worker] Kueri Final yang Dijalankan:\n${finalQuery}`);
    console.log("[Worker] Parameter Kueri:", queryParams);

    let counter = 0;
    const sqlStream = connection.connection.query(finalQuery, queryParams).stream();

    // Ini sekarang adalah 'try' block utama yang mengembalikan Promise
    return new Promise((resolve, reject) => {
      sqlStream.on("error", (err) => {
        console.error("[Worker] Error pada SQL Stream:", err);
        if (connection) connection.release();
        console.log("[Worker] Koneksi DB dilepaskan (karena error stream).");
        reject(err);
      });

      sqlStream.on("end", async () => {
        // Blok try/catch/finally BARU di dalam 'on(end)'
        try {
          console.log(`[Worker] SQL Stream Selesai. Total baris diterima: ${counter}`);

          // Commit Sheet 2 (Data Mentah)
          console.log("[Worker] Melakukan commit pada sheet 'Data Mentah'...");
          await rawSheet.commit();

          // Tulis data pivot ke Sheet 1
          console.log("[Worker] Menulis data pivot...");
          const aggregatedRows = Array.from(pivotData.values());

          aggregatedRows.forEach((row) => {
            const rowArray = [
              row.Sku,
              row.NamaProduk,
              ...locationCodes.map((code) => (row[code] === 0 ? "" : row[code])),
              row.GrandTotalKuantitas,
              row.HargaSatuan,
              row.GrandTotalNilai,
            ];
            const addedRow = pivotSheet.addRow(rowArray);

            // [BARU] Terapkan border dan style ke setiap sel di PIVOT sheet
            addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              cell.border = defaultBorder;
              // Kolom 1 (SKU) & 2 (Nama)
              if (colNumber <= 2) {
                cell.alignment = { vertical: "middle", horizontal: "left" };
                cell.numFmt = textFormat;
              }
              // Kolom Lokasi (mulai dari 3)
              else if (colNumber <= 2 + locationCodes.length) {
                cell.alignment = { vertical: "middle", horizontal: "right" };
                if (parseFloat(cell.value) < 0) {
                  cell.font = negativeRedText.font;
                }
                cell.numFmt = numberFormat;
              }
              // Kolom Grand Total Kuantitas
              else if (colNumber === 3 + locationCodes.length) {
                cell.alignment = { vertical: "middle", horizontal: "right" };
                if (parseFloat(cell.value) < 0) {
                  cell.font = negativeRedText.font;
                }
                cell.numFmt = numberFormat;
                cell.font = { bold: true };
              }
              // Kolom Harga & Total Nilai
              else {
                cell.alignment = { vertical: "middle", horizontal: "right" };
                cell.numFmt = currencyFormat;
              }
            });
          });

          // Commit Sheet 1 (Pivot)
          console.log("[Worker] Melakukan commit pada sheet 'Ringkasan Stok'...");
          await pivotSheet.commit();

          // Selesaikan file
          console.log("[Worker] Melakukan commit pada WORKBOOK...");
          await writer.commit();

          console.log("[Worker] File Excel selesai ditulis ke disk.");
          resolve(); // Pekerjaan SUKSES
        } catch (err) {
          console.error("[Worker] Error saat `on('end')`:", err);
          reject(err); // Tolak promise jika commit gagal
        } finally {
          if (connection) connection.release(); // Rilis koneksi SETELAH 'on(end)' selesai
          console.log("[Worker] Koneksi DB dilepaskan (setelah stream berakhir).");
        }
      });

      // Logika on('data')
      sqlStream.on("data", async (row) => {
        sqlStream.pause();
        try {
          // =================================================================
          // ================== PERBAIKAN BUG EXCELJS (FINAL) ================
          // =================================================================
          // Alih-alih mengirim 'row' (objek), kirim array manual
          // Ini mem-bypass bug pemetaan 'exceljs'
          const rowArray = [
            row.Sku,
            row.NamaProduk,
            row.Lokasi,
            row.Kuantitas,
            row.HargaSatuan,
            row.TotalNilai,
          ];

          const addedRow = rawSheet.addRow(rowArray);

          // [BARU] Terapkan border dan style ke setiap sel di RAW sheet
          addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.border = defaultBorder;
            // Kolom 1-3 (Teks)
            if (colNumber <= 3) {
              cell.alignment = { vertical: "middle", horizontal: "left" };
              cell.numFmt = textFormat;
            }
            // Kolom 4 (Kuantitas)
            else if (colNumber === 4) {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              if (parseFloat(cell.value) < 0) {
                cell.font = negativeRedText.font;
              }
              cell.numFmt = numberFormat;
            }
            // Kolom 5-6 (Mata Uang)
            else {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.numFmt = currencyFormat;
            }
          });
          // =================================================================

          const qty = parseFloat(row.Kuantitas) || 0;
          const val = parseFloat(row.TotalNilai) || 0;
          if (!pivotData.has(row.Sku)) {
            const newEntry = {
              Sku: row.Sku,
              NamaProduk: row.NamaProduk,
              HargaSatuan: parseFloat(row.HargaSatuan) || 0,
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
          counter++;
          if (counter % BATCH_SIZE === 0) {
            console.log(`[Worker] Memproses baris ke-${counter}...`);
            await sleep(DELAY_MS);
          }
        } catch (err) {
          console.error("[Worker] Error saat `on('data')`:", err);
          sqlStream.destroy(err);
          reject(err); // Tolak promise jika 'on(data)' gagal
        } finally {
          sqlStream.resume();
        }
      });
    }); // Akhir dari 'return new Promise'
  } catch (error) {
    console.error("[Worker] Error besar di generateStockReportStreaming:", error);
    if (writer) {
      try {
        await writer.abort();
      } catch (e) {}
    }
    if (connection) connection.release();
    console.log("[Worker] Koneksi DB dilepaskan (karena error besar).");
    throw error;
  }
}

/**
 * Fungsi Utama Pekerja Antrian
 */
export const processQueue = async () => {
  let connection;
  let jobId = null;
  try {
    connection = await db.getConnection();

    // TUGAS 1: Bersihkan pekerjaan yang macet
    const [timeoutResult] = await connection.query(
      `UPDATE export_jobs
       SET status = 'FAILED', error_message = 'Job timeout after ${JOB_TIMEOUT_MINUTES} minutes'
       WHERE status = 'PROCESSING'
       AND processing_started_at < NOW() - INTERVAL ${JOB_TIMEOUT_MINUTES} MINUTE`
    );
    if (timeoutResult.affectedRows > 0) {
      console.log(`[Queue] Ditemukan ${timeoutResult.affectedRows} pekerjaan macet.`);
    }

    // TUGAS 2: Ambil pekerjaan PENDING baru
    const [jobs] = await connection.query(
      `SELECT * FROM export_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1`
    );

    if (jobs.length === 0) {
      return;
    }

    jobId = jobs[0].id;
    console.log(`[Queue] Memulai pekerjaan ID: ${jobId}`);

    // TUGAS 3: Kunci & Proses Pekerjaan
    await connection.query(
      "UPDATE export_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?",
      [jobId]
    );

    const dateStr = getFormattedDateTime();
    const fileName = `Laporan_Stok_${dateStr}_(Job-${jobId}).xlsx`;
    const filePath = path.join(EXPORT_DIR_PATH, fileName);

    const filters = JSON.parse(jobs[0].filters);
    console.log(`[Queue] Menerima job.filters (raw): ${jobs[0].filters}`);
    console.log("[Queue] Job filters (parsed):", filters);

    // Panggil fungsi streaming kita
    await generateStockReportStreaming(filters, filePath);

    // 3c. Update jika Sukses
    await connection.query(
      "UPDATE export_jobs SET status = 'COMPLETED', file_path = ? WHERE id = ?",
      [fileName, jobId]
    );
    console.log(`[Queue] Selesai pekerjaan ID: ${jobId}`);
  } catch (error) {
    // 3d. Update jika Gagal
    console.error(`[Queue] Gagal pekerjaan ID: ${jobId || "UNKNOWN"}`, error);
    if (jobId && connection) {
      try {
        await connection.query(
          "UPDATE export_jobs SET status = 'FAILED', error_message = ? WHERE id = ?",
          [error.message || "Unknown error", jobId]
        );
      } catch (dbError) {
        console.error(
          `[Queue] GAGAL TOTAL: Tidak bisa update status FAILED untuk Job ID ${jobId}`,
          dbError
        );
      }
    }
  } finally {
    if (connection) connection.release();
  }
};

// Logika untuk mencegah 'process.exit()' jika di-impor
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[Worker] Menjalankan sebagai skrip mandiri (DEPRECATED)");
  processQueue().finally(() => {
    if (db.pool) {
      console.log("[Worker] Menutup pool database mandiri.");
      db.pool.end();
    }
    process.exit();
  });
}

// Ekspor untuk 'dev-worker'
export default processQueue;
