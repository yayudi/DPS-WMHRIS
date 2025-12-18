import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchSheet, cleanHarga } from "./taskHelpers.js";

const SPREADSHEET_REKAP = "11hYwMDDTXDEabZg0p7HVwj3_4T5uUjvVrvcEaqnUFFs";
const RANGE_REKAP = "REKAP!A1:Z5000";
const SPREADSHEET_MASTER = "16498vcLnqZZ5gyMQBV7dasKXG7ldfXfKk9t3Wtt6xdA";
const RANGE_MASTER = "ALL-DATA!A1:D20000";

// Dapatkan path direktori saat ini
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PERUBAHAN: Tentukan path untuk file log ---
const logFilePath = path.join(__dirname, "../../", "cron_sync_log.txt");

/**
 * Fungsi logging yang diperbarui.
 * Mencetak ke konsol DAN menambahkan ke file log.
 * @param {string} msg - Pesan log.
 */
function logToFile(msg) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${msg}\n`;

  // Tambahkan ke file log
  fs.appendFileSync(logFilePath, logMessage);
}

export async function syncStockToDatabase() {
  logToFile("===== SIKLUS SINKRONISASI BARU DIMULAI =====");
  try {
    logToFile("Memulai sinkronisasi stok (mode ekspor log)...");
    logToFile("Memulai pengambilan data dari Google Sheets...");
    const [rekapData, skuMasterData] = await Promise.all([
      fetchSheet(SPREADSHEET_REKAP, RANGE_REKAP),
      fetchSheet(SPREADSHEET_MASTER, RANGE_MASTER),
    ]);
    logToFile(
      `Pengambilan data selesai. Ditemukan ${rekapData.length} baris di REKAP dan ${skuMasterData.length} baris di MASTER.`
    );

    skuMasterData.forEach((row) => {
      for (const key in row) {
        if (key.includes("Harga")) {
          row[key] = cleanHarga(row[key]);
        }
      }
    });

    logToFile("Memulai penggabungan data...");
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
    logToFile(`Penggabungan data selesai. ${merged.length} produk ditemukan.`);
    logToFile("✅ Proses selesai tanpa error fatal.");
    logToFile("===== SIKLUS SINKRONISASI SELESAI =====\n");
  } catch (error) {
    logToFile(`❌ Terjadi error fatal saat proses: ${error.message}`);
    logToFile("===== SIKLUS SINKRONISASI GAGAL =====\n");
    throw error; // Lemparkan error agar job tercatat sebagai 'failed'
  }
}
