// backend\scripts\devImport.js
import { importQueue } from "./importQueue.js"; // Impor worker BARU
import db from "../../config/db.js"; // Impor db untuk rilis koneksi

const INTERVAL_MS = 15000; // Cek setiap 15 detik (berbeda dari export)
let isWorking = false; // "flock" versi lokal

console.log("[DevWorker-IMPORT] Simulator CRON untuk IMPOR dimulai. Mengecek setiap 15 detik...");

const runWorker = async () => {
  if (isWorking) {
    console.log("[DevWorker-IMPORT] Pekerjaan impor sebelumnya masih berjalan. Dilewati.");
    return;
  }

  try {
    isWorking = true;
    // console.log("[DevWorker-IMPORT] Menjalankan importQueue...");
    await importQueue(); // Panggil fungsi yang di-impor
    // console.log("[DevWorker-IMPORT] importQueue selesai.");
  } catch (err) {
    console.error("[DevWorker-IMPORT] Error menjalankan importQueue:", err);
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
  console.log("[DevWorker-IMPORT] Menghentikan... Menutup pool database.");
  if (db.pool) {
    db.pool.end();
  }
});

process.on("SIGINT", () => {
  process.exit();
});
