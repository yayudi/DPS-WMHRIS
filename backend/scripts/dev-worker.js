import processQueue from "./processExportQueue.js"; // Impor fungsi
import db from "../config/db.js"; // Impor db untuk rilis koneksi

const INTERVAL_MS = 10000; // Cek setiap 10 detik
let isWorking = false; // "flock" versi lokal

console.log("[DevWorker] Simulator CRON dimulai. Mengecek setiap 10 detik...");

const runWorker = async () => {
  if (isWorking) {
    console.log("[DevWorker] Pekerjaan sebelumnya masih berjalan. Dilewati.");
    return;
  }

  try {
    isWorking = true;
    console.log("[DevWorker] Menjalankan processQueue...");
    await processQueue(); // Panggil fungsi yang di-impor
    console.log("[DevWorker] processQueue selesai.");
  } catch (err) {
    console.error("[DevWorker] Error menjalankan processQueue:", err);
  } finally {
    isWorking = false;
  }
};

// Jalankan sekali saat startup
runWorker();

// Jalankan secara interval
setInterval(runWorker, INTERVAL_MS);

// Handle rilis koneksi saat server dihentikan
process.on("exit", () => {
  console.log("[DevWorker] Menghentikan... Menutup pool database.");
  if (db.pool) {
    db.pool.end();
  }
});

process.on("SIGINT", () => {
  process.exit();
});
