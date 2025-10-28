/**
 * Skrip Node.js untuk MENGIMPOR ULANG (DELETE ALL + INSERT) data komponen produk paket
 * dari file CSV ke tabel 'package_components'.
 * Skrip ini juga akan menandai produk terkait sebagai paket di tabel 'products'.
 *
 * Prasyarat:
 * 1. Pastikan file .env di folder `backend` sudah dikonfigurasi.
 * 2. File CSV dengan data paket (Kolom: SKU Paket, SKU Komponen, Jumlah) sudah ada.
 * 3. Dependensi: `mysql2` (harus sudah ada), `dotenv` (harus sudah ada)
 *
 * PERINGATAN: Skrip ini akan MENGHAPUS SEMUA data yang ada di tabel 'package_components'
 * sebelum memasukkan data baru dari CSV. Lakukan backup jika perlu.
 *
 * Cara Menjalankan:
 * 1. Pindahkan file CSV ke folder `backend/scripts` (atau sesuaikan path).
 * 2. Buka terminal di folder `backend`.
 * 3. Jalankan: `node scripts/import_package_components.js`
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import db from "../config/db.js"; // Pastikan path ini benar
import "dotenv/config";

// --- KONFIGURASI ---
const DATA_FILE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "package_components.csv"
);
const COL_PACKAGE_SKU = "Kode / SKU Produk Paket";
const COL_COMPONENT_SKU = "Kode / SKU Produk Komponen";
const COL_QUANTITY = "Jumlah Produk";

// --- FUNGSI UTAMA ---
async function importPackageComponents() {
  console.log(`Membaca file data dari: ${DATA_FILE_PATH}`);
  let data;

  try {
    // --- Logika Parsing CSV ---
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
        row._rowIndex = lineIndex + 2;
        return row;
      });
      console.log(`Berhasil membaca ${data.length} baris data dari CSV.`);
    } else {
      throw new Error("Format file tidak didukung saat ini (hanya .csv)");
    }
    // --- AKHIR LOGIKA PARSING ---

    if (data.length === 0) {
      console.log("Tidak ada data untuk diproses.");
      return;
    }
  } catch (err) {
    console.error(`❌ Gagal membaca atau mem-parsing file data: ${err.message}`);
    return;
  }

  let connection;
  let insertedRows = 0;
  let updatedPackages = 0;
  const importErrors = [];
  const missingSkuDetails = [];
  const skippedRowDetails = [];

  try {
    connection = await db.getConnection();
    console.log("✅ Koneksi database berhasil.");
    await connection.beginTransaction();
    console.log("--- Memulai Transaksi Impor (DELETE + INSERT) ---");

    // 1. KOSONGKAN TABEL package_components
    console.log("Mengosongkan tabel 'package_components'...");
    await connection.query("DELETE FROM package_components");
    console.log("Tabel 'package_components' berhasil dikosongkan.");

    const productCache = new Map(); // Cache ID produk

    // Fungsi helper getProductId (tetap sama)
    const getProductId = async (sku, rowIndex, skuType) => {
      if (!sku) return null;
      if (productCache.has(sku)) {
        return productCache.get(sku);
      }
      const [rows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      if (rows.length === 0) {
        missingSkuDetails.push({ sku, type: skuType, firstFoundAtRow: rowIndex });
        productCache.set(sku, null);
        return null;
      }
      const productId = rows[0].id;
      productCache.set(sku, productId);
      return productId;
    };

    // 2. PROSES INSERT DATA BARU
    console.log("Memulai proses INSERT data komponen...");
    for (const row of data) {
      const packageSku = row[COL_PACKAGE_SKU];
      const componentSku = row[COL_COMPONENT_SKU];
      const quantityStr = row[COL_QUANTITY];
      const rowIndex = row._rowIndex;
      let skipReason = null;

      // Validasi dasar
      if (!packageSku || !componentSku || !quantityStr) {
        skipReason = `Data tidak lengkap. Paket: '${packageSku}', Komp: '${componentSku}', Qty: '${quantityStr}'`;
        skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        continue;
      }
      const quantity = parseInt(quantityStr, 10);
      if (isNaN(quantity) || quantity <= 0) {
        skipReason = `Kuantitas "${quantityStr}" tidak valid.`;
        skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        continue;
      }

      // Dapatkan ID Produk
      const packageProductId = await getProductId(packageSku, rowIndex, "Paket");
      const componentProductId = await getProductId(componentSku, rowIndex, "Komponen");

      // Jika SKU hilang, catat skip
      if (packageProductId === null || componentProductId === null) {
        const missingPkg = packageProductId === null;
        const missingComp = componentProductId === null;
        if (missingPkg && missingComp)
          skipReason = `SKU Paket (${packageSku}) & Komponen (${componentSku}) tidak ditemukan.`;
        else if (missingPkg) skipReason = `SKU Paket (${packageSku}) tidak ditemukan.`;
        else skipReason = `SKU Komponen (${componentSku}) tidak ditemukan.`;

        // Hindari duplikasi log skip
        if (
          !skippedRowDetails.some((s) => s.row === rowIndex && s.reason.includes("tidak ditemukan"))
        ) {
          skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        }
        continue;
      }

      // Pastikan produk paket tidak sama dengan komponennya
      if (packageProductId === componentProductId) {
        skipReason = `Produk paket tidak boleh sama dengan komponennya (${packageSku}).`;
        skippedRowDetails.push({ row: rowIndex, reason: skipReason });
        continue;
      }

      // Update flag is_package di tabel products (jika belum)
      try {
        const [updateResult] = await connection.query(
          "UPDATE products SET is_package = TRUE WHERE id = ? AND is_package = FALSE",
          [packageProductId]
        );
        if (updateResult.affectedRows > 0) {
          updatedPackages++;
          console.log(
            `  -> Baris ${rowIndex}: Menandai ${packageSku} (ID: ${packageProductId}) sebagai paket.`
          );
        }
      } catch (updatePkgError) {
        importErrors.push({
          row: rowIndex,
          error: `Gagal update is_package untuk ${packageSku}: ${updatePkgError.message}`,
        });
        continue; // Lanjut ke baris berikutnya jika gagal update flag
      }

      // Masukkan data ke package_components
      // Gunakan INSERT biasa karena tabel sudah kosong. Error di sini berarti ada duplikasi di CSV.
      try {
        const [insertResult] = await connection.query(
          "INSERT INTO package_components (package_product_id, component_product_id, quantity_per_package) VALUES (?, ?, ?)",
          [packageProductId, componentProductId, quantity]
        );
        if (insertResult.affectedRows > 0) {
          insertedRows++;
          // console.log(`  -> Baris ${rowIndex}: Insert ${packageSku} -> ${componentSku} Qty: ${quantity}.`) // Uncomment jika perlu log per baris
        } else {
          // Ini seharusnya tidak terjadi dengan INSERT biasa kecuali ada warning
          importErrors.push({
            row: rowIndex,
            error: `Gagal insert ${packageSku} -> ${componentSku}, affectedRows = 0.`,
          });
        }
      } catch (insertError) {
        // Tangani error INSERT (misal, duplikasi PK jika ada baris sama persis di CSV)
        importErrors.push({
          row: rowIndex,
          error: `Gagal insert ${packageSku} -> ${componentSku}: ${insertError.message}`,
        });
      }
    } // Akhir loop

    // Proses hasil
    if (importErrors.length > 0 || missingSkuDetails.length > 0 || skippedRowDetails.length > 0) {
      console.warn("\n--- LAPORAN MASALAH IMPOR ---");
      if (missingSkuDetails.length > 0) {
        console.warn(`\n[SKU Tidak Ditemukan di Tabel 'products']:`);
        const missingGrouped = missingSkuDetails.reduce((acc, curr) => {
          if (!acc[curr.sku]) {
            acc[curr.sku] = { type: curr.type, firstFoundAtRow: curr.firstFoundAtRow };
          }
          return acc;
        }, {});
        Object.entries(missingGrouped).forEach(([sku, details]) => {
          console.warn(
            `  - SKU: "${sku}" (${details.type}), baris CSV: ${details.firstFoundAtRow}`
          );
        });
      }
      if (skippedRowDetails.length > 0) {
        console.warn(`\n[Baris CSV Dilewati (${skippedRowDetails.length} baris)]:`);
        skippedRowDetails.forEach((detail) =>
          console.warn(`  - Baris ${detail.row}: ${detail.reason}`)
        );
      }
      if (importErrors.length > 0) {
        console.warn("\n[Error Saat Mencoba INSERT/UPDATE Baris Berikut]:");
        importErrors.forEach((err) => console.warn(`  - Baris ${err.row}: ${err.error}`));
        throw new Error("Terjadi error saat impor data, transaksi dibatalkan.");
      }
      console.warn("------------------------------\n");
    }

    await connection.commit();
    console.log("✅ Transaksi berhasil di-commit.");
  } catch (error) {
    if (connection) {
      console.error("❌ Terjadi error, melakukan rollback transaksi...");
      await connection.rollback();
    }
    console.error("❌ Gagal mengimpor data:", error.message);
  } finally {
    if (connection) {
      connection.release();
      console.log("Koneksi database dilepas.");
    }
    console.log("\n--- Ringkasan Impor Komponen Paket ---");
    console.log(`Total Baris Dibaca dari CSV: ${data.length}`);
    console.log(`Baris Berhasil Dimasukkan: ${insertedRows}`);
    console.log(`Produk Ditandai Sebagai Paket: ${updatedPackages}`);
    console.log(`Total Baris Dilewati: ${skippedRowDetails.length}`);
    console.log(`Total Error Impor: ${importErrors.length}`);
    const uniqueMissingSkus = new Set(missingSkuDetails.map((m) => m.sku));
    console.log(`SKU Unik Tidak Ditemukan: ${uniqueMissingSkus.size}`);
    console.log("---------------------------------------");
  }
}

// Jalankan fungsi impor
importPackageComponents();
