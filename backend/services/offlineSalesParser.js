// backend\services\offlineSalesParser.js
import fs from "fs/promises";
import { parse } from "csv-parse";
import db from "../config/db.js";
import { log } from "./tasks/taskHelpers.js"; // Asumsi Anda punya helper log

/**
 * Membersihkan dan memvalidasi data dari baris CSV.
 */
function cleanRow(row) {
  // Ambil kolom yang kita butuhkan (sesuai nama di CSV)
  const invoiceId = row["*Nomor Tagihan"]?.trim();
  const customerName = row["*Nama Kontak"]?.trim();
  const sku = row["*Kode Produk (SKU)"]?.trim();
  const productName = row["*Nama Produk"]?.trim();
  const quantity = parseInt(row["*Jumlah Produk"], 10);
  const source = row["Status"]?.trim() || "Offline"; // Misal 'Lunas' atau 'Belum Lunas'

  // Validasi data
  if (!invoiceId || !sku || !quantity || isNaN(quantity)) {
    return null; // Data tidak lengkap, lewati baris ini
  }

  return { invoiceId, customerName, sku, productName, quantity, source };
}

/**
 * Mengelompokkan baris CSV mentah menjadi daftar invoice unik dengan item-itemnya.
 * Ini adalah solusi untuk "duplikasi Nomor Tagihan di dalam file".
 * @param {Array} csvData - Array objek hasil parse CSV
 * @returns {Map<string, object>} - Map dari invoice yang sudah di-grup
 */
function groupInvoices(csvData) {
  log(`[CSV Parser] Memulai grouping ${csvData.length} baris CSV...`);
  const invoicesMap = new Map();

  for (const row of csvData) {
    const data = cleanRow(row);
    if (!data) continue; // Lewati baris yang tidak valid

    const { invoiceId, customerName, sku, productName, quantity, source } = data;

    const item = {
      sku: sku,
      name: productName,
      quantity: quantity,
    };

    if (!invoicesMap.has(invoiceId)) {
      // Jika ini baris pertama untuk invoice ini, buat entri induknya
      invoicesMap.set(invoiceId, {
        invoiceId: invoiceId,
        customerName: customerName,
        source: source,
        items: [item],
      });
    } else {
      // Jika invoice sudah ada, tambahkan item ini ke daftarnya
      invoicesMap.get(invoiceId).items.push(item);
    }
  }
  log(`[CSV Parser] Grouping selesai. Ditemukan ${invoicesMap.size} invoice unik.`);
  return invoicesMap;
}

/**
 * Fungsi utama untuk memproses file CSV Picking List yang di-upload.
 * @param {string} filePath - Path ke file CSV yang di-upload (misal di /tmp)
 * @param {number} userId - ID user yang meng-upload
 * @returns {object} - Hasil proses (created, skipped)
 */
export async function processPickingListCsv(filePath, userId) {
  let connection;
  try {
    // 1. Baca dan Parse CSV
    const fileContent = await fs.readFile(filePath, "utf8");
    const records = await new Promise((resolve, reject) => {
      parse(fileContent, { columns: true, skip_empty_lines: true }, (err, output) => {
        if (err) reject(err);
        resolve(output);
      });
    });

    // 2. Kelompokkan berdasarkan Nomor Tagihan
    const invoicesMap = groupInvoices(records);
    if (invoicesMap.size === 0) {
      throw new Error("Tidak ada data valid yang ditemukan di dalam file CSV.");
    }

    // 3. Mulai Transaksi SQL
    log("[CSV Parser] Memulai transaksi database...");
    connection = await db.getConnection();
    await connection.beginTransaction();

    let createdCount = 0;
    let skippedCount = 0;

    for (const [invoiceId, invoiceData] of invoicesMap.entries()) {
      try {
        // 4. Masukkan ke picking_lists
        // Ini akan gagal jika invoiceId sudah ada (karena UNIQUE index)
        const [listResult] = await connection.query(
          `INSERT INTO picking_lists
            (user_id, source, status, created_at)
           VALUES (?, ?, ?, NOW())`,
          [
            userId,
            invoiceData.source,
            "PENDING", // Status default
            invoiceData.invoiceId,
            invoiceData.customerName,
          ]
        );

        const pickingListId = listResult.insertId;

        // 5. Siapkan item-itemnya untuk bulk insert
        const itemsToInsert = invoiceData.items.map((item) => [
          pickingListId,
          item.sku, // Simpan SKU asli
          item.quantity,
          // Kita tidak tahu product_id saat ini, jadi kita isi null
          // atau kita bisa lakukan JOIN saat mengambil data
          null,
        ]);

        // 6. Bulk Insert item-item
        if (itemsToInsert.length > 0) {
          await connection.query(
            `INSERT INTO picking_list_items
              (picking_list_id, original_sku, quantity, product_id)
             VALUES ?`,
            [itemsToInsert]
          );
        }
        createdCount++;
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          // 7. Tangani Duplikat (Solusi untuk "Cons")
          log(`[CSV Parser] 🟡 Melewati ${invoiceId}: Nomor Tagihan sudah ada.`);
          skippedCount++;
        } else {
          // Error lain yang tidak terduga, batalkan semua
          throw error;
        }
      }
    }

    // 8. Selesaikan Transaksi
    await connection.commit();
    log("[CSV Parser] ✅ Transaksi berhasil di-commit.");

    return {
      success: true,
      message: `Import berhasil. ${createdCount} list baru dibuat, ${skippedCount} list dilewati (duplikat).`,
      created: createdCount,
      skipped: skippedCount,
    };
  } catch (error) {
    if (connection) await connection.rollback();
    log(`[CSV Parser] ❌ Gagal: ${error.message}`);
    console.error(error);
    throw new Error(error.message || "Gagal memproses file CSV.");
  } finally {
    if (connection) connection.release();
    // Hapus file sementara setelah selesai
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.warn(`Gagal menghapus file sementara: ${filePath}`);
    }
  }
}
