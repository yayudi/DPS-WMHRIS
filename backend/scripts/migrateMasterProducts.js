import db from "../config/db.js";
import "dotenv/config";
import { fetchSheet, cleanHarga } from "./tasks/taskHelpers.js"; // Hanya butuh cleanHarga

// --- KONFIGURASI ---
// HANYA butuh SPREADSHEET_MASTER
const SPREADSHEET_MASTER = "16498vcLnqZZ5gyMQBV7dasKXG7ldfXfKk9t3Wtt6xdA";
const RANGE_MASTER = "ALL-DATA!A1:D20000";

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Fungsi migrasi yang disederhanakan:
 * HANYA mengimpor SEMUA produk dari SPREADSHEET_MASTER ke tabel 'products'.
 * Mengabaikan 'SPREADSHEET_REKAP' dan 'stock_locations'.
 */
async function migrateMasterProducts() {
  log("🚀 Memulai migrasi MASTER PRODUCTS 'tanpa pandang bulu'...");
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    log("✅ Koneksi database berhasil dan transaksi dimulai.");

    // 1. (Opsional) Ambil data dari Google Sheets
    log("⬇️  Mengambil data dari SPREADSHEET_MASTER...");
    const skuMasterData = await fetchSheet(SPREADSHEET_MASTER, RANGE_MASTER);
    log(
      `👍 Data MASTER berhasil diambil. ${skuMasterData.length} baris MASTER.`
    );

    // 2. Kosongkan HANYA tabel products
    log("🗑️  Membersihkan tabel products...");
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    await connection.query("TRUNCATE TABLE products");
    await connection.query("SET FOREIGN_KEY_CHECKS=1");

    let productsCreated = 0;
    const productsToInsert = [];

    // 3. Loop melalui SEMUA produk dari SPREADSHEET_MASTER
    for (const productData of skuMasterData) {
      const sku = productData.SKU?.trim();
      const name = productData.NAMA?.trim();
      const price = cleanHarga(productData["Harga PL"] || 0);
      const isActive = true;

      // Hanya masukkan jika SKU dan Nama valid
      if (sku && name) {
        productsToInsert.push([sku, name, price, isActive]);
        productsCreated++;
      }
    }

    // 4. Lakukan satu kali INSERT besar (Bulk Insert)
    if (productsToInsert.length > 0) {
      log(`🔄 Memasukkan ${productsToInsert.length} produk ke database...`);
      await connection.query(
        "INSERT INTO products (sku, name, price, is_active) VALUES ?",
        [productsToInsert]
      );
    }

    await connection.commit();
    log("✅ Transaksi berhasil di-commit.");
    log(`🎉 Migrasi Selesai!`);
    log(`   - ${productsCreated} produk berhasil dibuat dari MASTER.`);
  } catch (error) {
    if (connection) await connection.rollback();
    log("❌ Terjadi error fatal selama migrasi:");
    console.error(error);
  } finally {
    if (connection) connection.release();
    await db.end();
    log("🚪 Koneksi database ditutup.");
  }
}

migrateMasterProducts();
