// backend/scripts/purgeObsoleteData.js
import db from "../config/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- KONFIGURASI ---
const RETENTION_DAYS = 30; // Hapus data obsolete yg lebih tua dari 30 hari
const BATCH_SIZE = 1000; // Hapus per 1000 baris agar DB tidak lock

// Logger sederhana
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, "../logs", "purge_job.log");

const log = (msg) => {
  const time = new Date().toISOString();
  const text = `[${time}] ${msg}\n`;
  console.log(msg);
  try {
    if (!fs.existsSync(path.dirname(LOG_FILE)))
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, text);
  } catch (e) {
    console.error("Log error:", e);
  }
};

const purgeObsoleteData = async () => {
  let connection;
  try {
    log(`🚀 Memulai Purge Job (Retention: ${RETENTION_DAYS} hari)...`);

    connection = await db.getConnection();

    // Hitung kandidat penghapusan
    const [countRes] = await connection.query(
      `SELECT COUNT(*) as total FROM picking_lists
       WHERE status = 'OBSOLETE'
       AND updated_at < NOW() - INTERVAL ? DAY`,
      [RETENTION_DAYS]
    );

    const totalToDelete = countRes[0].total;

    if (totalToDelete === 0) {
      log("✅ Tidak ada data usang yang perlu dihapus.");
      return;
    }

    log(`🗑️ Ditemukan ${totalToDelete} invoice obsolete yang akan dihapus.`);

    // Hapus bertahap (Batching)
    let deletedCount = 0;
    while (deletedCount < totalToDelete) {
      // Kita hapus Header-nya saja.
      // Asumsi: Tabel picking_list_items punya constraint ON DELETE CASCADE foreign key ke picking_lists.
      // Jika tidak, Anda harus hapus items dulu baru header.

      const [res] = await connection.query(
        `DELETE FROM picking_lists
         WHERE status = 'OBSOLETE'
         AND updated_at < NOW() - INTERVAL ? DAY
         LIMIT ?`,
        [RETENTION_DAYS, BATCH_SIZE]
      );

      if (res.affectedRows === 0) break;

      deletedCount += res.affectedRows;
      log(
        `   ... Menghapus batch ${res.affectedRows} baris. Total: ${deletedCount}/${totalToDelete}`
      );

      // Istirahat sejenak agar CPU DB turun
      await new Promise((r) => setTimeout(r, 200));
    }

    log(`🏁 Purge Selesai. Total dihapus: ${deletedCount} invoice beserta itemnya.`);
  } catch (error) {
    log(`🔥 ERROR Purge Job: ${error.message}`);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
};

// Jalankan
purgeObsoleteData();

// crontab -e
// Tambahkan baris ini untuk menjalankan script setiap hari Minggu jam 3 pagi:
// 0 3 * * 0 /usr/bin/node /path/to/your/project/backend/scripts/purgeObsoleteData.js
