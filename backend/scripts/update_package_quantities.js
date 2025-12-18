/**
 * Skrip Node.js untuk MEMPERBARUI kolom 'quantity_per_package'
 * di tabel 'package_components' berdasarkan data dari file Excel/CSV.
 *
 * Skrip ini mengasumsikan baris di 'package_components' sudah ada
 * (dibuat oleh impor sebelumnya atau manual), tetapi kolom quantity-nya salah (misal 0).
 *
 * Prasyarat:
 * Pastikan file .env di folder `backend` sudah dikonfigurasi.
 * File CSV dengan data paket sudah ada.
 * Dependensi: `mysql2` (harus sudah ada), `dotenv` (harus sudah ada)
 *
 * Cara Menjalankan:
 * Pindahkan file CSV ke folder `backend/scripts` (atau sesuaikan path).
 * Buka terminal di folder `backend`.
 * Jalankan: `node scripts/update_package_quantities.js`
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs"; // <-- Import fs
import db from "../config/db.js"; // Pastikan path ini benar
import "dotenv/config";

// --- KONFIGURASI ---
const DATA_FILE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "package_components.csv"
); // Ganti ke .xlsx jika file Excel

// Sesuaikan nama kolom ini agar SAMA PERSIS dengan header di file CSV Anda
const COL_PACKAGE_SKU = "Kode / SKU Produk Paket";
const COL_COMPONENT_SKU = "Kode / SKU Produk Komponen";
const COL_QUANTITY = "Jumlah Produk";

// --- FUNGSI UTAMA ---
async function updatePackageQuantities() {
  let data;

  try {
    // --- LENGKAPI LOGIKA PARSING CSV ---
    if (DATA_FILE_PATH.toLowerCase().endsWith(".csv")) {
      if (!fs.existsSync(DATA_FILE_PATH)) {
        throw new Error(`File CSV tidak ditemukan di ${DATA_FILE_PATH}`);
      }
      const fileContent = fs.readFileSync(DATA_FILE_PATH, "utf-8");
      const lines = fileContent.trim().split(/\r?\n/);
      if (lines.length < 2) throw new Error("File CSV kosong atau hanya berisi header.");

      const headers = lines[0].split(",").map((h) => h.trim());
      if (
        !headers.includes(COL_PACKAGE_SKU) ||
        !headers.includes(COL_COMPONENT_SKU) ||
        !headers.includes(COL_QUANTITY)
      ) {
        throw new Error(
          `Header CSV tidak sesuai. Pastikan ada: "${COL_PACKAGE_SKU}", "${COL_COMPONENT_SKU}", "${COL_QUANTITY}".`
        );
      }

      data = lines.slice(1).map((line, lineIndex) => {
        const values = line.split(",");
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim().replace(/^"|"$/g, "") || "";
        });
        row._rowIndex = lineIndex + 2; // Simpan nomor baris asli untuk logging error
        return row;
      });
    } else {
      throw new Error("Format file tidak didukung saat ini (hanya .csv)");
    }
    // --- AKHIR LOGIKA PARSING ---

    if (data.length === 0) {
      return;
    }
  } catch (err) {
    console.error(`❌ Gagal membaca atau mem-parsing file data: ${err.message}`);
    return;
  }

  let connection;
  let updatedRows = 0;
  const updateErrors = []; // Ganti nama 'errors' menjadi 'updateErrors'
  const missingSkuDetails = []; // Array untuk menyimpan detail SKU yang hilang
  const skippedRowDetails = []; // Array untuk menyimpan detail baris yang dilewati

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const productCache = new Map(); // Cache untuk ID produk

    // Fungsi helper untuk mendapatkan ID produk berdasarkan SKU
    // Tambahkan argumen rowIndex dan skuType untuk logging
    const getProductId = async (sku, rowIndex, skuType) => {
      if (!sku) return null; // Handle SKU kosong
      if (productCache.has(sku)) {
        return productCache.get(sku);
      }
      const [rows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      if (rows.length === 0) {
        // --- Catat detail SKU yang hilang ---
        missingSkuDetails.push({ sku, type: skuType, firstFoundAtRow: rowIndex });
        // Tandai SKU ini agar tidak dicatat ulang di baris lain
        productCache.set(sku, null); // Set null di cache agar tidak query lagi
        return null; // SKU tidak ditemukan
      }
      const productId = rows[0].id;
      productCache.set(sku, productId);
      return productId;
    };

    for (const row of data) {
      const packageSku = row[COL_PACKAGE_SKU];
      const componentSku = row[COL_COMPONENT_SKU];
      const quantityStr = row[COL_QUANTITY];
      const rowIndex = row._rowIndex;
      let skipReason = null; // Variabel untuk menyimpan alasan skip

      // Validasi dasar
      if (!packageSku || !componentSku || !quantityStr) {
        skipReason = `Data tidak lengkap (SKU atau Kuantitas kosong). Paket: '${packageSku}', Komp: '${componentSku}', Qty: '${quantityStr}'`;
        skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        continue;
      }

      const quantity = parseInt(quantityStr, 10);
      if (isNaN(quantity) || quantity <= 0) {
        skipReason = `Kuantitas "${quantityStr}" tidak valid (harus angka > 0).`;
        skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        continue;
      }

      // Dapatkan ID Produk
      // Kirim rowIndex dan tipe SKU ke getProductId
      const packageProductId = await getProductId(packageSku, rowIndex, "Paket");
      const componentProductId = await getProductId(componentSku, rowIndex, "Komponen");

      // Jika SKU tidak ditemukan (sudah dicatat oleh getProductId), catat skip dan lanjut
      if (packageProductId === null || componentProductId === null) {
        // Hanya tambahkan ke skipped jika belum tercatat karena missing SKU
        const isMissingPkg = missingSkuDetails.some(
          (m) => m.sku === packageSku && m.firstFoundAtRow === rowIndex
        );
        const isMissingComp = missingSkuDetails.some(
          (m) => m.sku === componentSku && m.firstFoundAtRow === rowIndex
        );

        if (isMissingPkg && isMissingComp) {
          skipReason = `SKU Paket (${packageSku}) dan Komponen (${componentSku}) tidak ditemukan.`;
        } else if (isMissingPkg) {
          skipReason = `SKU Paket (${packageSku}) tidak ditemukan.`;
        } else if (isMissingComp) {
          skipReason = `SKU Komponen (${componentSku}) tidak ditemukan.`;
        }
        // Hindari duplikasi log skip jika alasan utamanya adalah missing SKU
        if (
          skipReason &&
          !skippedRowDetails.some((s) => s.row === rowIndex && s.reason.includes("tidak ditemukan"))
        ) {
          skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        }
        continue; // Lanjut ke baris berikutnya
      }

      // Jalankan UPDATE
      try {
        const [updateResult] = await connection.query(
          "UPDATE package_components SET quantity_per_package = ? WHERE package_product_id = ? AND component_product_id = ?",
          [quantity, packageProductId, componentProductId]
        );

        if (updateResult.affectedRows > 0) {
          updatedRows++;
        } else if (updateResult.changedRows === 0 && updateResult.affectedRows === 0) {
          // Jika tidak ada baris terpengaruh DAN tidak ada yang berubah,
          // kemungkinan besar kombinasi package/component tidak ada di tabel target.
          skipReason = `Kombinasi paket ${packageSku} -> ${componentSku} tidak ditemukan di tabel package_components.`;
          skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        }
        // Jika affectedRows > 0 tapi changedRows = 0, berarti datanya sudah sama (tidak perlu log skip)
      } catch (updateError) {
        // Tangani error spesifik saat UPDATE
        updateErrors.push({
          row: rowIndex,
          packageSku,
          componentSku,
          error: updateError.message,
        });
      }
    } // Akhir loop

    // Proses hasil
    if (updateErrors.length > 0 || missingSkuDetails.length > 0 || skippedRowDetails.length > 0) {
      console.warn("\n--- LAPORAN MASALAH IMPOR ---");
      // Laporan SKU Tidak Ditemukan
      if (missingSkuDetails.length > 0) {
        console.warn(
          `\n[SKU Tidak Ditemukan di Tabel 'products'] (${missingSkuDetails.length} SKU unik):`
        );
        // Kelompokkan berdasarkan SKU untuk kejelasan
        const missingGrouped = missingSkuDetails.reduce((acc, curr) => {
          if (!acc[curr.sku]) {
            acc[curr.sku] = { type: curr.type, firstFoundAtRow: curr.firstFoundAtRow };
          }
          return acc;
        }, {});
        Object.entries(missingGrouped).forEach(([sku, details]) => {
          console.warn(
            `  - SKU: "${sku}" (${details.type}), pertama ditemukan di baris CSV: ${details.firstFoundAtRow}`
          );
        });
      }
      // Laporan Baris Dilewati
      if (skippedRowDetails.length > 0) {
        console.warn(`\n[Baris CSV Dilewati] (${skippedRowDetails.length} baris):`);
        skippedRowDetails.forEach((detail) =>
          console.warn(`  - Baris ${detail.row}: ${detail.reason}`)
        );
      }
      // Laporan Error Update
      if (updateErrors.length > 0) {
        console.warn("\n[Error Saat Mencoba Mengupdate Baris Berikut]:");
        updateErrors.forEach((err) =>
          console.warn(
            `  - Baris ${err.row} (${err.packageSku} -> ${err.componentSku}): ${err.error}`
          )
        );
        // Putuskan untuk rollback jika ada error update
        throw new Error("Terjadi error saat mengupdate data, transaksi dibatalkan.");
      }
      console.warn("------------------------------\n");
    }

    await connection.commit();
  } catch (error) {
    if (connection) {
      console.error("❌ Terjadi error, melakukan rollback transaksi...");
      await connection.rollback();
    }
    console.error("❌ Gagal mengupdate data:", error.message);
    // console.error(error.stack); // Uncomment untuk stack trace lengkap jika perlu
  } finally {
    if (connection) {
      connection.release();
    }
    // Hitung SKU unik yang hilang
    const uniqueMissingSkus = new Set(missingSkuDetails.map((m) => m.sku));
  }
}

// Jalankan fungsi update
updatePackageQuantities();
