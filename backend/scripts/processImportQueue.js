// backend/scripts/processImportQueue.js
import db from "../config/db.js";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import csv from "fast-csv";

// --- KONFIGURASI ---
const JOB_TIMEOUT_MINUTES = 10;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ===================================================================
 * FUNGSI INTI 1: processStockAdjustmentFile
 * ===================================================================
 * Memproses file .xlsx untuk penyesuaian stok (dari WMSBatchAdjustment.vue)
 */
async function processStockAdjustmentFile(job, connection) {
  console.log(`[ImportWorker] Memulai job ADJUST_STOCK (Excel) untuk ${job.original_filename}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.file_path);
  const worksheet = workbook.getWorksheet("Input Stok"); // Ambil berdasarkan nama

  if (!worksheet) {
    throw new Error("Gagal menemukan sheet 'Input Stok' di dalam file Excel.");
  }

  await connection.beginTransaction();
  try {
    console.log("[ImportWorker] Transaksi Penyesuaian Stok dimulai.");

    const rowCount = worksheet.rowCount;
    let successCounter = 0;
    let errorCounter = 0;
    const errors = [];

    // Loop dari baris 2 (untuk lewati header)
    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);
      if (row.values.length === 0) continue; // Lewati baris kosong

      const sku = row.getCell("A").value?.toString().trim();
      const locationCode = row.getCell("B").value?.toString().trim(); // "LT"
      const newQty_str = row.getCell("C").value?.toString().trim(); // "ACTUAL"
      const notes_excel = row.getCell("D").value?.toString().trim() || "";

      // Validasi data baris
      if (!sku || !locationCode || newQty_str === undefined || newQty_str === null) {
        errors.push(`Baris ${i}: Data tidak lengkap (SKU/LT/ACTUAL).`);
        errorCounter++;
        continue; // Lanjut ke baris berikutnya
      }

      const newQty = parseInt(newQty_str, 10);
      if (isNaN(newQty)) {
        errors.push(`Baris ${i} (SKU ${sku}): Kuantitas '${newQty_str}' bukan angka.`);
        errorCounter++;
        continue;
      }

      // Validasi data dari database
      const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      const [locationRows] = await connection.query("SELECT id FROM locations WHERE code = ?", [
        locationCode,
      ]);

      if (productRows.length === 0) {
        errors.push(`Baris ${i}: SKU '${sku}' tidak ditemukan.`);
        errorCounter++;
        continue;
      }
      if (locationRows.length === 0) {
        errors.push(`Baris ${i}: Lokasi '${locationCode}' tidak ditemukan.`);
        errorCounter++;
        continue;
      }

      const productId = productRows[0].id;
      const locationId = locationRows[0].id;
      const userId = job.user_id;

      // Dapatkan stok saat ini (dan kunci baris untuk transaksi)
      const [stockRows] = await connection.query(
        "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
        [productId, locationId]
      );

      const currentQty = stockRows[0]?.quantity || 0;
      const movementQty = newQty - currentQty; // Hitung selisihnya

      if (movementQty === 0) {
        continue; // Tidak ada perubahan, lewati
      }

      // Update tabel stok
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = ?",
        [productId, locationId, newQty, newQty]
      );

      // Gabungkan catatan dari UI (job.notes) dan Excel (notes_excel)
      const movementNote = [job.notes, notes_excel].filter(Boolean).join(" | ");

      // Catat di tabel pergerakan (audit trail)
      await connection.query(
        `INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes)
         VALUES (?, ?, ?, ?, 'ADJUST_UPLOAD', ?, ?)`,
        [
          productId,
          Math.abs(movementQty),
          movementQty < 0 ? locationId : null, // from_location (jika berkurang)
          movementQty > 0 ? locationId : null, // to_location (jika bertambah)
          userId,
          movementNote,
        ]
      );
      successCounter++;
    } // Akhir loop 'for'

    if (errorCounter > 0) {
      // Jika ada error di baris manapun, batalkan seluruh transaksi
      throw new Error(`Gagal: ${errorCounter} baris error. Error pertama: ${errors[0]}`);
    }

    await connection.commit();
    fs.unlinkSync(job.file_path); // Hapus file setelah sukses

    return `Impor penyesuaian sukses: ${successCounter} baris diproses.`;
  } catch (error) {
    await connection.rollback();
    console.error("[ImportWorker] GAGAL processStockAdjustmentFile:", error);
    throw error; // Lempar error agar job ditandai FAILED
  }
}

/**
 * ===================================================================
 * FUNGSI INTI 2: processAttendanceFile
 * ===================================================================
 */
async function processAttendanceFile(job, connection) {
  console.log(`[ImportWorker] Memulai job IMPORT_ATTENDANCE untuk ${job.original_filename}`);
  // (Logika parser absensi... )
  throw new Error("Logika IMPORT_ATTENDANCE belum diimplementasikan.");
}

/**
 * ===================================================================
 * FUNGSI INTI 3: processTokopediaReport
 * ===================================================================
 * Memproses file .csv Laporan Penjualan Tokopedia
 */
async function processTokopediaReport(job, connection) {
  console.log(
    `[ImportWorker] Memulai job IMPORT_SALES_TOKOPEDIA (CSV) untuk ${job.original_filename}`
  );
  // Tokopedia CSV menggunakan comma (,) sebagai pemisah
  const stream = fs.createReadStream(job.file_path).pipe(
    csv.parse({
      headers: true,
      delimiter: ",",
    })
  );

  await connection.beginTransaction();
  try {
    const orders = new Map(); // Untuk mengelompokkan item per pesanan

    await new Promise((resolve, reject) => {
      stream.on("data", (row) => {
        const orderId = row["Order ID"];
        const sku = row["Seller SKU"];
        const qty = parseInt(row["Quantity"], 10);
        const status = row["Order Status"];
        const customer = row["Recipient"];

        // Hanya proses pesanan yang statusnya 'Perlu dikirim'
        if (status !== "Perlu dikirim" || !orderId || !sku || isNaN(qty)) {
          return; // Lewati baris ini
        }

        const item = { sku, qty, originalSku: sku, variationName: row["Variation"] };

        if (!orders.has(orderId)) {
          orders.set(orderId, {
            source: "Tokopedia",
            invoice: orderId,
            customer: customer,
            items: [],
          });
        }
        orders.get(orderId).items.push(item);
      });
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    // Masukkan data yang sudah dikelompokkan ke DB
    for (const [orderId, orderData] of orders.entries()) {
      // 1. Buat Picking List
      const [pickingList] = await connection.query(
        `INSERT INTO picking_lists (user_id, source, original_invoice_id, customer_name, status, original_filename)
         VALUES (?, ?, ?, ?, 'PENDING_VALIDATION', ?)
         ON DUPLICATE KEY UPDATE id=id`, // Jangan impor jika invoice sudah ada
        [
          job.user_id,
          orderData.source,
          orderData.invoice,
          orderData.customer,
          job.original_filename,
        ]
      );

      const pickingListId = pickingList.insertId;
      if (pickingListId === 0) {
        console.log(`[ImportWorker] Pesanan Tokopedia ${orderId} sudah ada, dilewati.`);
        continue;
      }

      // 2. Masukkan Item-itemnya
      for (const item of orderData.items) {
        const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [
          item.sku,
        ]);
        const productId = productRows[0]?.id;

        if (!productId) {
          throw new Error(`(Tokopedia) SKU '${item.sku}' di invoice ${orderId} tidak ditemukan.`);
        }

        await connection.query(
          `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity)
            VALUES (?, ?, ?, ?)`,
          [pickingListId, productId, item.originalSku, item.qty]
        );
      }
    }

    await connection.commit();
    fs.unlinkSync(job.file_path); // Hapus file
    return `Impor Tokopedia (CSV) sukses: ${orders.size} pesanan dibuat.`;
  } catch (error) {
    await connection.rollback();
    console.error("[ImportWorker] GAGAL processTokopediaReport:", error);
    throw error;
  }
}

/**
 * ===================================================================
 * FUNGSI INTI 4: processShopeeReport
 * ===================================================================
 * Memproses file .xlsx Laporan Penjualan Shopee
 */
async function processShopeeReport(job, connection) {
  console.log(
    `[ImportWorker] Memulai job IMPORT_SALES_SHOPEE (Excel) untuk ${job.original_filename}`
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.file_path);
  const worksheet = workbook.getWorksheet(1); // Ambil sheet pertama

  if (!worksheet) {
    throw new Error("Gagal menemukan sheet di dalam file Laporan Shopee.");
  }

  await connection.beginTransaction();
  try {
    const orders = new Map();
    const rowCount = worksheet.rowCount;

    // Loop dari baris 2 (untuk lewati header)
    for (let i = 2; i <= rowCount; i++) {
      const row = worksheet.getRow(i);

      // Mapping Kolom (dapat disesuaikan)
      const orderId = row.getCell("A").value?.toString().trim(); // Kolom A: No. Pesanan
      const status = row.getCell("B").value?.toString().trim(); // Kolom B: Status Pesanan
      const sku = row.getCell("O").value?.toString().trim(); // Kolom O: Nomor Referensi SKU
      const qty_val = row.getCell("R").value; // Kolom R: Jumlah
      const customer = row.getCell("BA").value?.toString().trim(); // Kolom BA: Username (Pembeli)

      const qty =
        typeof qty_val === "object" && qty_val.result
          ? parseInt(qty_val.result, 10)
          : parseInt(qty_val, 10);

      // Hanya proses pesanan yang statusnya 'Perlu Dikirim'
      if (status !== "Perlu Dikirim" || !orderId || !sku || isNaN(qty) || qty === 0) {
        continue; // Lewati baris ini
      }

      const item = {
        sku,
        qty,
        originalSku: sku,
        variationName: row.getCell("P").value?.toString().trim(),
      };

      if (!orders.has(orderId)) {
        orders.set(orderId, {
          source: "Shopee",
          invoice: orderId,
          customer: customer,
          items: [],
        });
      }
      orders.get(orderId).items.push(item);
    } // Akhir loop 'for'

    // Masukkan data yang sudah dikelompokkan ke DB
    for (const [orderId, orderData] of orders.entries()) {
      // 1. Buat Picking List
      const [pickingList] = await connection.query(
        `INSERT INTO picking_lists (user_id, source, original_invoice_id, customer_name, status, original_filename)
         VALUES (?, ?, ?, ?, 'PENDING_VALIDATION', ?)
         ON DUPLICATE KEY UPDATE id=id`, // Jangan impor jika invoice sudah ada
        [
          job.user_id,
          orderData.source,
          orderData.invoice,
          orderData.customer,
          job.original_filename,
        ]
      );

      const pickingListId = pickingList.insertId;
      if (pickingListId === 0) {
        console.log(`[ImportWorker] Pesanan Shopee ${orderId} sudah ada, dilewati.`);
        continue;
      }

      // 2. Masukkan Item-itemnya
      for (const item of orderData.items) {
        const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [
          item.sku,
        ]);
        const productId = productRows[0]?.id;

        if (!productId) {
          throw new Error(`(Shopee) SKU '${item.sku}' di invoice ${orderId} tidak ditemukan.`);
        }

        await connection.query(
          `INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity)
            VALUES (?, ?, ?, ?)`,
          [pickingListId, productId, item.originalSku, item.qty]
        );
      }
    }

    await connection.commit();
    fs.unlinkSync(job.file_path); // Hapus file
    return `Impor Shopee (Excel) sukses: ${orders.size} pesanan dibuat.`;
  } catch (error) {
    await connection.rollback();
    console.error("[ImportWorker] GAGAL processShopeeReport:", error);
    throw error;
  }
}

/**
 * ===================================================================
 * FUNGSI UTAMA: processImportQueue
 * ===================================================================
 * Fungsi worker inti yang dipanggil oleh cron job.
 */
export const processImportQueue = async () => {
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();

    // 1. Bersihkan job yang macet (Pilar Anti-Macet)
    const [timeoutResult] = await connection.query(
      `UPDATE import_jobs
        SET status = 'FAILED', log_summary = 'Job timeout setelah ${JOB_TIMEOUT_MINUTES} menit'
        WHERE status = 'PROCESSING'
        AND processing_started_at < NOW() - INTERVAL ${JOB_TIMEOUT_MINUTES} MINUTE`
    );
    if (timeoutResult.affectedRows > 0) {
      console.log(`[ImportWorker] Ditemukan ${timeoutResult.affectedRows} pekerjaan macet.`);
    }

    // 2. Ambil 1 job PENDING
    const [jobs] = await connection.query(
      `SELECT * FROM import_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1`
    );

    if (jobs.length === 0) {
      return; // Tidak ada pekerjaan, keluar
    }

    const job = jobs[0];
    jobId = job.id;
    console.log(`[ImportWorker] Memulai pekerjaan ID: ${jobId} (Tipe: ${job.job_type})`);

    // 3. Kunci Job
    await connection.query(
      "UPDATE import_jobs SET status = 'PROCESSING', processing_started_at = NOW() WHERE id = ?",
      [jobId]
    );

    let logSummary = "";

    // 4. Jalankan logika berdasarkan 'job_type'
    switch (job.job_type) {
      case "ADJUST_STOCK":
        logSummary = await processStockAdjustmentFile(job, connection);
        break;

      case "IMPORT_SALES_TOKOPEDIA":
        logSummary = await processTokopediaReport(job, connection);
        break;

      case "IMPORT_SALES_SHOPEE":
        logSummary = await processShopeeReport(job, connection);
        break;

      case "IMPORT_SALES_OFFLINE":
        logSummary = "Parser Offline belum di-porting.";
        break;

      case "IMPORT_ATTENDANCE":
        logSummary = await processAttendanceFile(job, connection);
        break;

      default:
        throw new Error(`Job type tidak dikenal: ${job.job_type}`);
    }

    // 5. Jika sukses, tandai Selesai
    await connection.query(
      "UPDATE import_jobs SET status = 'COMPLETED', log_summary = ? WHERE id = ?",
      [logSummary, jobId]
    );
    console.log(`[ImportWorker] Selesai pekerjaan ID: ${jobId}`);
  } catch (error) {
    // 6. Jika gagal, tandai Gagal
    console.error(`[ImportWorker] GAGAL pekerjaan ID: ${jobId || "UNKNOWN"}`, error);
    if (jobId) {
      await connection.query(
        "UPDATE import_jobs SET status = 'FAILED', log_summary = ? WHERE id = ?",
        [error.message || "Unknown error", jobId]
      );
    }
  } finally {
    if (connection) connection.release();
  }
};

// Ekspor untuk 'dev-worker'
export default processImportQueue;

// =======================================================
// Logika untuk menjalankan skrip ini secara mandiri oleh CRON JOB
// =======================================================
if (
  import.meta.url.startsWith("file://") &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1])
) {
  console.log("[ImportWorker] Menjalankan sebagai skrip mandiri (via Cron)...");
  processImportQueue().finally(() => {
    console.log("[ImportWorker] Proses mandiri selesai.");
    if (db.pool) {
      db.pool.end(); // Tutup koneksi pool agar proses node bisa keluar
    }
    process.exit(0);
  });
}
