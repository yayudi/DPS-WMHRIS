import fs from "fs/promises";
import path from "path";

/**
 * Memastikan sebuah direktori ada, jika tidak, membuatnya.
 * Ini adalah fungsi pembantu untuk menjaga kode tetap bersih.
 * @param {string} dirPath Path ke direktori
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch (error) {
    // Jika error karena direktori tidak ada, buat secara rekursif
    if (error.code === "ENOENT") {
      await fs.mkdir(dirPath, { recursive: true });
    } else {
      // Lemparkan error lain jika bukan karena tidak ada
      throw error;
    }
  }
}

/**
 * TUGAS 1: Mengambil data hari libur nasional dari API publik.
 * Ini adalah pengganti penuh untuk cron_holidays.php.
 */
async function fetchAndCacheHolidays() {
  const year = new Date().getFullYear();
  const url = `https://libur.deno.dev/api?year=${year}`;

  // Menggunakan process.cwd() untuk path yang konsisten
  const outputDir = path.join(process.cwd(), "public", "json", "absensi", "holidays");
  const outFile = path.join(outputDir, `${year}.json`);

  console.log(`[CRON] Memulai pengambilan data hari libur untuk tahun ${year}...`);
  try {
    await ensureDir(outputDir);
    const response = await fetch(url, { headers: { "User-Agent": "MyOffice-Cron/1.0" } });
    if (!response.ok) {
      throw new Error(`Gagal mengambil data. Status HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("Respons dari API bukan dalam format JSON array yang valid.");
    }

    await fs.writeFile(outFile, JSON.stringify(data, null, 2));
    console.log(`✅ [CRON] Data libur berhasil disimpan ke ${outFile} (${data.length} entri)`);
  } catch (error) {
    console.error(`❌ [CRON] Gagal saat mengambil data libur:`, error.message);
    process.exit(1); // Keluar dengan kode error
  }
}

/**
 * TUGAS 2: Mengambil data stok.
 * Ini adalah pengganti untuk fetch_stok.py.
 * TODO: Implementasikan logika pengambilan stok Anda yang sesungguhnya di sini.
 */
async function fetchAndCacheStock() {
  console.log("[CRON] Memulai pengambilan data stok...");
  try {
    // --- GANTI DENGAN LOGIKA ANDA ---
    // Contoh: Ambil data dari API lain atau file lain
    // const response = await fetch('https://sumber.stok.com/api');
    // const stockData = await response.json();

    // Data placeholder untuk demonstrasi
    const stockData = [
      { sku: "CONTOH-001", name: "Produk Contoh", qty: 150 },
      { sku: "CONTOH-002", name: "Produk Lain", qty: 75 },
    ];
    // ---------------------------------

    const outputDir = path.join(process.cwd(), "public", "json", "wms");
    await ensureDir(outputDir);
    const outFile = path.join(outputDir, "stok.json");
    await fs.writeFile(outFile, JSON.stringify(stockData, null, 2));
    console.log(`✅ [CRON] Data stok berhasil disimpan ke ${outFile}`);
  } catch (error) {
    console.error(`❌ [CRON] Gagal saat mengambil data stok:`, error.message);
    process.exit(1);
  }
}

// ===================================================================
// == RUNNER UTAMA ==
// ===================================================================

// Ambil argumen dari command line untuk menentukan tugas mana yang akan dijalankan
const args = process.argv.slice(2);

// Jalankan tugas yang sesuai
if (args.includes("holidays")) {
  fetchAndCacheHolidays();
} else if (args.includes("stock")) {
  fetchAndCacheStock();
} else {
  console.log("Perintah tidak valid. Gunakan salah satu argumen berikut:");
  console.log("  node scripts/runCronJobs.js holidays");
  console.log("  node scripts/runCronJobs.js stock");
  process.exit(1);
}
