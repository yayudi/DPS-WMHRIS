import fs from "fs/promises";
import path from "path";

// ✅ 1. Impor fungsi-fungsi pembantu dari pustaka terpusat
import { log, ensureDir } from "./taskHelpers.js";

/**
 * TUGAS: Mengambil data hari libur nasional dari API publik.
 * Fungsi ini sekarang lebih bersih karena menggunakan helper yang diimpor.
 */
export async function fetchAndCacheHolidays() {
  const year = new Date().getFullYear();
  const url = `https://libur.deno.dev/api?year=${year}`;
  log(`[FETCH-HOLIDAYS] Memulai pengambilan data untuk tahun ${year}...`);

  try {
    const response = await fetch(url, { headers: { "User-Agent": "MyOffice-Cron/1.0" } });
    if (!response.ok) {
      throw new Error(`Gagal mengambil data. Status HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Respons dari API bukan dalam format JSON array yang valid.");
    }

    // ✅ 2. Path sekarang menggunakan process.cwd() untuk konsistensi
    const outputDir = path.join(process.cwd(), "public", "json", "absensi", "holidays");
    const outFile = path.join(outputDir, `${year}.json`);

    // Pastikan direktori ada sebelum menulis file
    await ensureDir(outputDir);

    await fs.writeFile(outFile, JSON.stringify(data, null, 2));
    log(`✅ [FETCH-HOLIDAYS] Data berhasil disimpan ke ${outFile}`);
  } catch (error) {
    log(`❌ [FETCH-HOLIDAYS] Gagal: ${error.message}`);
    // Lemparkan error kembali agar worker bisa menandainya sebagai 'failed'
    throw error;
  }
}
