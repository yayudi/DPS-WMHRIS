import db from "../config/db.js";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 15; // Batas waktu pekerjaan 'PROCESSING'
const BATCH_SIZE = 100; // Proses 100 baris...
const DELAY_MS = 20; // ...lalu tidur selama 20md (hemat CPU)
const EXPORT_DIR = path.join(process.cwd(), "tmp", "exports"); // Pastikan folder ini ada dan bisa ditulis

// Pastikan direktori ekspor ada
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Helper "tidur" untuk throttling CPU
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper styling (Di-copy dari reportService.js Anda)
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
};

/**
 * Ini adalah versi "Streaming" dari generateStockReport Anda.
 * Didesain untuk RAM rendah dan CPU yang di-throttle.
 */
async function generateStockReportStreaming(filters, filePath) {
  let connection;
  // Gunakan WorkbookWriter untuk streaming langsung ke DISK, bukan ke RAM
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath });

  try {
    connection = await db.getConnection();

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
    pivotSheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
    pivotSheet.getRow(1).height = 30;
    pivotSheet.getRow(2).height = 10;
    pivotSheet.getRow(3).values = headerTexts;
    styleHeader(pivotSheet, 3, totalColumns, "FF4472C4", "FFFFFFFF");

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

    // Kunci untuk Agregasi di RAM (Ini JAUH LEBIH KECIL dari 700MB)
    const pivotData = new Map();

    // --- Setup Kueri SQL (Logika sama persis seperti reportService.js Anda) ---
    let whereClauses = ["p.is_active = 1"];
    const queryParams = [];

    // **** TAMBAHAN DEBUGGING ****
    console.log("[Worker] Membangun kueri dengan filters:", JSON.stringify(filters));
    // **** -------------------- ****

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
        // Default ke 'positive' jika tidak ada, BUKAN 'all'
        console.log("[Worker] Peringatan: stockStatus tidak ada, default ke 'positive'");
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

    // **** TAMBAHAN DEBUGGING ****
    console.log("[Worker] Kueri Final yang Dijalankan:", finalQuery);
    console.log("[Worker] Parameter Kueri:", JSON.stringify(queryParams));
    // **** -------------------- ****

    // --- Proses Inti: STREAMING dan THROTTLING ---
    let counter = 0;
    // Gunakan .stream() untuk hemat RAM
    const sqlStream = connection.connection.query(finalQuery, queryParams).stream();

    return new Promise((resolve, reject) => {
      let rowCount = 0; // Hitung baris yang diterima
      sqlStream.on("error", (err) => reject(err));

      sqlStream.on("end", async () => {
        try {
          // **** TAMBAHAN DEBUGGING ****
          console.log(`[Worker] SQL Stream Selesai. Total baris diterima: ${rowCount}`);
          // **** -------------------- ****

          // ==========================================================
          // [FIX 1] Commit sheet "Data Mentah" SEKARANG, setelah on('data') selesai
          console.log("[Worker] Melakukan commit pada sheet 'Data Mentah'...");
          rawSheet.commit();
          // ==========================================================

          console.log("[Worker] Menulis data pivot...");
          // Sekarang tulis Sheet 1 (Pivot) dari data agregasi di RAM
          const aggregatedRows = Array.from(pivotData.values());
          aggregatedRows.forEach((row) => {
            const rowData = { ...row };
            for (const code of locationCodes) {
              if (rowData[code] === 0) rowData[code] = "";
            }
            // ==========================================================
            // [FIX 2] JANGAN commit baris per baris. Tulis saja barisnya.
            pivotSheet.addRow(rowData);
            // ==========================================================
          });

          // ==========================================================
          // [FIX 3] Commit sheet "Ringkasan Stok" SEKARANG, di akhir
          console.log("[Worker] Melakukan commit pada sheet 'Ringkasan Stok'...");
          pivotSheet.commit();
          // ==========================================================

          // [FIX 4] Hapus commit yang salah dari perbaikan sebelumnya
          // rawSheet.commit(); // HAPUS INI

          await writer.commit(); // Selesaikan file
          console.log("[Worker] File Excel selesai ditulis ke disk.");
          resolve(); // Pekerjaan SUKSES
        } catch (err) {
          reject(err);
        }
      });

      // Ini berjalan untuk SETIAP baris dari 15.000+ baris
      sqlStream.on("data", async (row) => {
        rowCount++; // Hitung baris
        // 1. PAUSE stream untuk throttling
        sqlStream.pause();

        try {
          // 2. Agregasi di RAM (untuk Sheet 1)
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
            // Ganti nama 'GrandTotal' dan 'TotalNilai' agar sesuai header
            newEntry["Grand Total"] = 0;
            newEntry["Total Nilai"] = 0;

            for (const code of locationCodes) newEntry[code] = 0;
            pivotData.set(row.Sku, newEntry);
          }
          const current = pivotData.get(row.Sku);
          if (row.Lokasi && locationCodes.includes(row.Lokasi)) {
            current[row.Lokasi] += qty;
          }
          current.GrandTotalKuantitas += qty;
          current.GrandTotalNilai += val;

          // Update nama kolom yang benar
          current["Grand Total"] = current.GrandTotalKuantitas;
          current["Total Nilai"] = current.GrandTotalNilai;

          // 3. Tulis ke DISK (untuk Sheet 2)
          // ==========================================================
          // [FIX 5] JANGAN .commit() di sini. Tulis saja barisnya.
          rawSheet.addRow(row);
          // ==========================================================

          // 4. LOGIKA THROTTLING (HEMAT CPU)
          counter++;
          if (counter % BATCH_SIZE === 0) {
            if (counter % 5000 === 0) console.log(`[Worker] Memproses baris ke-${counter}...`);
            await sleep(DELAY_MS); // "Tidur" untuk melepaskan CPU
          }
        } catch (err) {
          sqlStream.destroy(err); // Hentikan stream jika ada error
          reject(err);
        } finally {
          // 5. Lanjutkan stream untuk baris/batch berikutnya
          sqlStream.resume();
        }
      });
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Fungsi Utama Pekerja Antrian
 */
async function processQueue() {
  let connection;
  try {
    connection = await db.getConnection();

    // TUGAS 1: Bersihkan pekerjaan yang macet (Stuck Jobs)
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
      // console.log("[Queue] Tidak ada pekerjaan PENDING. Keluar.");
      return; // Keluar dengan tenang, jangan pakai process.exit()
    }

    const job = jobs[0];
    console.log(`[Queue] Memulai pekerjaan ID: ${job.id}`);

    // TUGAS 3: Kunci & Proses Pekerjaan
    await connection.query(
      "UPDATE export_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?",
      [job.id]
    );

    // 3b. Lakukan pekerjaan berat (STREAMING + THROTTLING)
    const filePath = path.join(EXPORT_DIR, `stock_report_${job.id}_${Date.now()}.xlsx`);
    try {
      // **** TAMBAHAN DEBUGGING ****
      console.log(`[Queue] Menerima job.filters (raw): ${job.filters}`);
      if (!job.filters) {
        throw new Error("Job filters tidak ada (null).");
      }
      const filters = JSON.parse(job.filters);
      console.log("[Queue] Job filters (parsed):", filters);
      // **** -------------------- ****

      // Panggil fungsi streaming kita yang baru
      await generateStockReportStreaming(filters, filePath);

      // 3c. Update jika Sukses
      await connection.query(
        "UPDATE export_jobs SET status = 'COMPLETED', file_path = ? WHERE id = ?",
        // Simpan path *relatif* agar Nginx/Apache lebih mudah menyajikannya
        [path.basename(filePath), job.id]
      );
      console.log(`[Queue] Selesai pekerjaan ID: ${job.id}`);
    } catch (error) {
      // 3d. Update jika Gagal
      console.error(`[Queue] Gagal pekerjaan ID: ${job.id}`, error.message);
      await connection.query(
        "UPDATE export_jobs SET status = 'FAILED', error_message = ? WHERE id = ?",
        [error.message || "Unknown error", job.id]
      );
    }
  } catch (err) {
    console.error("[Queue] Error besar pada worker:", err.message);
  } finally {
    if (connection) connection.release();
    // Hapus process.exit() agar dev-worker.js bisa terus berjalan
    // process.exit();
  }
}

// Jalankan Pekerja
// Modifikasi ini agar bisa di-import oleh dev-worker.js
// processQueue();
export default processQueue;
