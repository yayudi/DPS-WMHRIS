/* eslint-disable no-console */
import db from "../config/db.js";

async function calculateStats() {
  let connection;
  try {
    connection = await db.getConnection();
    console.log("Menghitung statistik pergerakan stok harian...");

    const [rows] = await connection.query(`
      SELECT
        ROUND(AVG(daily_count), 2) as avg_daily,
        MAX(daily_count) as max_daily,
        MIN(daily_count) as min_daily,
        COUNT(*) as total_days
      FROM (
        SELECT DATE(created_at) as movement_date, COUNT(*) as daily_count
        FROM stock_movements
        GROUP BY DATE(created_at)
      ) as daily_stats;
    `);

    const stats = rows[0];

    console.log("\n--- Hasil Analisis Data (stock_movements) ---");
    console.log(`Total Hari Aktif     : ${stats.total_days || 0} hari`);
    console.log(`Rata-rata Harian     : ${stats.avg_daily || 0} transaksi per hari`);
    console.log(
      `Maksimum Harian      : ${stats.max_daily || 0} transaksi dalam satu hari (Puncak)`,
    );
    console.log(`Minimum Harian       : ${stats.min_daily || 0} transaksi dalam satu hari`);

    console.log("\n--- Analisis Kuota Firebase (Spark Plan) ---");
    console.log(
      "Firebase Spark Plan (Gratis) mengizinkan 10GB Unduhan / bulan dan operasi tulis tak terbatas (selama tidak melampaui storage).",
    );
    console.log(
      "Karena kita hanya menembakkan *sinyal/ping* sangat singkat tanpa menyimpan data besar:",
    );

    if (stats.max_daily > 50000) {
      console.log(
        "⚠️ PERINGATAN: Transaksi harian Anda sangat tinggi, waspadai batas *bandwidth* 10GB/bulan dari klien yang listen.",
      );
    } else {
      console.log("✅ AMAN: Rata-rata transaksi Anda masih sangat aman untuk Firebase gratis.");
      console.log(
        "Penggunaan Firebase Realtime Database sebagai *Event Bus* akan berjalan lancar dan gratis pada skala ini.",
      );
    }
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

calculateStats();
