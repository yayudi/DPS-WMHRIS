import fs from "fs/promises";
import path from "path";
import db from "../config/db.js";

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Jika error karena tidak ada, buat direktorinya
    if (error.code === "ENOENT") {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      throw error;
    }
  }
}

export async function fetchAndCacheHolidays() {
  const year = new Date().getFullYear();
  const url = `https://libur.deno.dev/api?year=${year}`;
  log(`[FETCH-HOLIDAYS] Memulai pengambilan data untuk tahun ${year}...`);

  let connection; // Untuk transaksi SQL

  try {
    const response = await fetch(url, { headers: { "User-Agent": "MyOffice-Cron/1.0" } });
    if (!response.ok) {
      throw new Error(`Gagal mengambil data. Status HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Respons dari API bukan dalam format JSON array yang valid.");
    }

    log(`[FETCH-HOLIDAYS] Data API diterima. Memulai sinkronisasi ke SQL...`);

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Hapus data lama untuk tahun ini
    await connection.query("DELETE FROM holidays WHERE YEAR(date) = ?", [year]);

    const values = data
      .filter((row) => row.date && row.name) // Pastikan data valid
      .map((row) => [row.date, row.name]); // Format: [ ['YYYY-MM-DD', 'Nama Libur'], [...] ]

    // Masukkan data baru
    if (values.length > 0) {
      await connection.query("INSERT INTO holidays (date, name) VALUES ?", [values]);
    }

    await connection.commit();
    log(`✅ [FETCH-HOLIDAYS] Berhasil: ${values.length} hari libur disinkronkan ke SQL.`);
  } catch (error) {
    if (connection) await connection.rollback(); // Batalkan jika ada error
    log(`❌ [FETCH-HOLIDAYS] Gagal: ${error.message}`);
    throw error; // Lemparkan error agar runner di bawah bisa menangkapnya
  } finally {
    if (connection) connection.release();
  }
}

// --- Blok Eksekusi (Runner) ---
/**
 * IIFE (Immediately Invoked Function Expression) untuk menjalankan skrip.
 * Ini akan dieksekusi saat Anda menjalankan: node backend/scripts/fetchHolidays.js
 */
(async () => {
  try {
    await fetchAndCacheHolidays();
    log("🎉 [RUNNER] Skrip fetchHolidays selesai dengan sukses.");
  } catch (error) {
    log(`🔥 [RUNNER] Skrip fetchHolidays GAGAL: ${error.message}`);
    process.exitCode = 1; // Keluar dengan status error
  } finally {
    // Penting: Tutup pool koneksi database agar proses Node bisa berhenti.
    if (db && db.pool) {
      await db.pool.end();
      log("🔌 [RUNNER] Koneksi database ditutup.");
    }
  }
})();
