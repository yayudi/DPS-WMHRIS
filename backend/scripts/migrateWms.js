import db from "../config/db.js";
import "dotenv/config";
import { fetchSheet, cleanHarga, cleanQty } from "./tasks/taskHelpers.js";

// --- KONFIGURASI ---
const SPREADSHEET_REKAP = "11hYwMDDTXDEabZg0p7HVwj3_4T5uUjvVrvcEaqnUFFs";
const RANGE_REKAP = "REKAP!A1:Z5000";
const SPREADSHEET_MASTER = "16498vcLnqZZ5gyMQBV7dasKXG7ldfXfKk9t3Wtt6xdA";
const RANGE_MASTER = "ALL-DATA!A1:D20000";

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/**
 * Fungsi utama untuk migrasi data WMS dari Google Sheets ke database SQL.
 * Versi ini memastikan SEMUA produk dari SPREADSHEET_MASTER dibuat.
 */
async function migrateWmsData() {
  log("🚀 Memulai migrasi data WMS...");
  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    log("✅ Koneksi database berhasil dan transaksi dimulai.");

    // 1. Ambil semua data lokasi dari DB untuk pemetaan
    const [locations] = await connection.query("SELECT id, code FROM locations");
    const locationMap = new Map(locations.map((loc) => [loc.code.toUpperCase(), loc.id]));
    log(`🗺️  Berhasil memuat ${locationMap.size} lokasi dari database.`);

    // 2. Ambil data dari Google Sheets
    log("⬇️  Mengambil data dari Google Sheets...");
    const [rekapData, skuMasterData] = await Promise.all([
      fetchSheet(SPREADSHEET_REKAP, RANGE_REKAP),
      fetchSheet(SPREADSHEET_MASTER, RANGE_MASTER),
    ]);
    log(
      `👍 Data Google Sheets berhasil diambil. ${rekapData.length} baris REKAP, ${skuMasterData.length} baris MASTER.`
    );

    // 3. Buat Peta Stok dari REKAP untuk pencarian cepat
    const rekapMap = new Map(rekapData.map((row) => [row.SKU?.trim().toUpperCase(), row]));
    log(`🔄 Peta stok dari REKAP berhasil dibuat.`);

    // 4. Kosongkan tabel produk dan stok untuk memulai dari awal
    log("🗑️  Membersihkan tabel products dan stock_locations...");
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    await connection.query("TRUNCATE TABLE stock_locations");
    await connection.query("TRUNCATE TABLE products");
    await connection.query("SET FOREIGN_KEY_CHECKS=1");

    let productsCreated = 0;
    let stockLocationsCreated = 0;

    // --- PERBAIKAN LOGIKA UTAMA ---
    // 5. Loop melalui SEMUA produk dari SPREADSHEET_MASTER
    for (const productData of skuMasterData) {
      const sku = productData.SKU?.trim();
      const name = productData.NAMA?.trim();
      // Asumsi harga dari SPREADSHEET_MASTER jika ada, jika tidak dari REKAP
      const price = cleanHarga(productData["Harga PL"] || 0);
      const isActive = true;

      if (!sku || !name) continue;

      // Selalu masukkan produk ke tabel `products`
      const [productResult] = await connection.query(
        "INSERT INTO products (sku, name, price, is_active) VALUES (?, ?, ?, ?)",
        [sku, name, price, isActive]
      );
      const productId = productResult.insertId;
      productsCreated++;

      // Periksa apakah produk ini memiliki data stok di REKAP
      const rekapRow = rekapMap.get(sku.toUpperCase());
      if (rekapRow) {
        const stockLocationsToInsert = [];
        const ignoredKeys = ["SKU", "NAMA", "KATEGORI", "Harga PL", "Grand Total"];

        for (const key in rekapRow) {
          if (!ignoredKeys.includes(key) && rekapRow[key] && String(rekapRow[key]).trim()) {
            const locationCode = key.toUpperCase();
            const locationId = locationMap.get(locationCode);

            if (locationId) {
              stockLocationsToInsert.push([productId, locationId, cleanQty(rekapRow[key])]);
            } else {
              log(
                `🟡 Peringatan: Kode lokasi '${key}' untuk SKU '${sku}' tidak ditemukan di database.`
              );
            }
          }
        }

        if (stockLocationsToInsert.length > 0) {
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES ?",
            [stockLocationsToInsert]
          );
          stockLocationsCreated += stockLocationsToInsert.length;
        }
      }
    }

    await connection.commit();
    log("✅ Transaksi berhasil di-commit.");
    log(`🎉 Migrasi Selesai!`);
    log(`   - ${productsCreated} produk berhasil dibuat.`);
    log(`   - ${stockLocationsCreated} data lokasi stok berhasil dibuat.`);
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

migrateWmsData();
