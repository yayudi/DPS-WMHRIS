import { fetchSheet, cleanHarga } from "./taskHelpers.js";
import Logger from "../../utils/logger.js";

const SPREADSHEET_REKAP = "11hYwMDDTXDEabZg0p7HVwj3_4T5uUjvVrvcEaqnUFFs";
const RANGE_REKAP = "REKAP!A1:Z5000";
const SPREADSHEET_MASTER = "16498vcLnqZZ5gyMQBV7dasKXG7ldfXfKk9t3Wtt6xdA";
const RANGE_MASTER = "ALL-DATA!A1:D20000";

/**
 * Mengambil dan mensinkronisasikan data stok dari Google Sheets ke database.
 * @returns {Promise<void>}
 */
export async function syncStockToDatabase() {
  Logger.info("===== SIKLUS SINKRONISASI BARU DIMULAI =====", "SYNC_STOCK");
  try {
    Logger.info("Memulai sinkronisasi stok (mode ekspor log)...", "SYNC_STOCK");
    Logger.info("Memulai pengambilan data dari Google Sheets...", "SYNC_STOCK");
    const [rekapData, skuMasterData] = await Promise.all([
      fetchSheet(SPREADSHEET_REKAP, RANGE_REKAP),
      fetchSheet(SPREADSHEET_MASTER, RANGE_MASTER),
    ]);
    Logger.info(
      `Pengambilan data selesai. Ditemukan ${rekapData.length} baris di REKAP dan ${skuMasterData.length} baris di MASTER.`,
      "SYNC_STOCK",
    );

    skuMasterData.forEach((row) => {
      for (const key in row) {
        if (key.includes("Harga")) {
          row[key] = cleanHarga(row[key]);
        }
      }
    });

    Logger.info("Memulai penggabungan data...", "SYNC_STOCK");
    const rekapMap = new Map(rekapData.map((row) => [row.SKU?.trim().toUpperCase(), row]));
    const merged = [];
    for (const row of skuMasterData) {
      const sku = row.SKU?.trim().toUpperCase();
      if (rekapMap.has(sku)) {
        const rekapRow = rekapMap.get(sku);
        delete rekapRow.NAMA;
        merged.push({ ...row, ...rekapRow });
      }
    }
    Logger.info(`Penggabungan data selesai. ${merged.length} produk ditemukan.`, "SYNC_STOCK");
    Logger.info("Proses selesai tanpa error fatal.", "SYNC_STOCK");
    Logger.info("===== SIKLUS SINKRONISASI SELESAI =====", "SYNC_STOCK");
  } catch (error) {
    Logger.error(`❌ Terjadi error fatal saat proses: ${error.message}`, error, "SYNC_STOCK");
    Logger.warn("===== SIKLUS SINKRONISASI GAGAL =====", "SYNC_STOCK");
    throw error; // Lemparkan error agar job tercatat sebagai 'failed'
  }
}
