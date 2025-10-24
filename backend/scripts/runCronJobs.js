// backend\scripts\runCronJobs.js
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import db from "../config/db.js";

import { syncStockToDatabase } from "./tasks/syncStock.js";
import { fetchAndCacheHolidays } from "./tasks/fetchHolidays.js";

const JOB_TIMEOUT = 600000; // 10 menit
const STUCK_JOB_TIMEOUT = "15 MINUTE"; // Waktu untuk menganggap job "nyantol"

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Fungsi baru untuk membersihkan tugas yang "nyantol".
 * Menandai tugas yang statusnya 'processing' lebih dari 15 menit sebagai 'failed'.
 */
async function cleanupStuckJobs() {
  log("Mencari tugas yang 'nyantol'...");
  let connection;
  try {
    connection = await db.getConnection();
    const [result] = await connection.query(
      `UPDATE jobs SET status = 'failed', last_error = 'Timeout: Proses terhenti paksa atau melebihi batas waktu.' WHERE status = 'processing' AND started_processing_at < NOW() - INTERVAL ${STUCK_JOB_TIMEOUT}`
    );
    if (result.affectedRows > 0) {
      log(`🧹 Membersihkan ${result.affectedRows} tugas yang 'nyantol'.`);
    }
  } catch (error) {
    log(`⚠️ Gagal membersihkan tugas yang 'nyantol': ${error.message}`);
  } finally {
    if (connection) connection.release();
  }
}

async function processQueue() {
  log("Memeriksa antrian untuk tugas baru...");
  let connection;
  let jobId = null;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [jobs] = await connection.query(
      "SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1 FOR UPDATE"
    );

    if (jobs.length === 0) {
      log("Antrian kosong. Tidak ada yang perlu dikerjakan.");
      await connection.commit();
      return;
    }

    const job = jobs[0];
    jobId = job.id;

    // --- PERUBAHAN: Set started_processing_at saat mengambil tugas ---
    await connection.query(
      "UPDATE jobs SET status = 'processing', attempts = attempts + 1, started_processing_at = NOW() WHERE id = ?",
      [jobId]
    );

    await connection.commit();
    log(`Mengambil tugas '${job.task_name}' (ID: ${jobId}). Mulai memproses...`);

    let taskPromise;
    if (job.task_name === "stock") {
      taskPromise = syncStockToDatabase();
    } else if (job.task_name === "holidays") {
      taskPromise = fetchAndCacheHolidays();
    } else {
      throw new Error(`Nama tugas tidak dikenal: ${job.task_name}`);
    }

    await Promise.race([
      taskPromise,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Tugas melebihi batas waktu internal (10 menit)")),
          JOB_TIMEOUT
        )
      ),
    ]);

    await connection.query(
      "UPDATE jobs SET status = 'completed', processed_at = NOW(), started_processing_at = NULL WHERE id = ?",
      [jobId]
    );

    log(`✅ Tugas '${job.task_name}' (ID: ${jobId}) berhasil diselesaikan.`);
  } catch (error) {
    log(`❌ Gagal memproses tugas (ID: ${jobId}). Error: ${error.message}`);
    if (connection && jobId) {
      await connection.query("UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?", [
        error.message.substring(0, 1000),
        jobId,
      ]);
    }
  } finally {
    if (connection) connection.release();
  }
}

// --- Runner Utama ---
async function main() {
  try {
    // --- PERUBAHAN: Jalankan pembersih terlebih dahulu ---
    await cleanupStuckJobs();
    await processQueue();
  } catch (error) {
    log(`Error fatal pada worker: ${error.message}`);
  } finally {
    await db.end();
    log("Worker selesai, koneksi ditutup.");
  }
}

main();
