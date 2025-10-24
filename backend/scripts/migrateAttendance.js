import fs from "fs";
import path from "path";
import db from "../config/db.js";
import "dotenv/config";

const BASE_JSON_DIR = path.join(process.cwd(), "assets", "json", "absensi");

// --- LOGIKA BISNIS DIIMPOR DARI PARSER ANDA ---
const JAM_KERJA_MULAI = 480; // 08:00
const JAM_KERJA_SELESAI = 960; // 16:00
const JAM_KERJA_SELESAI_SABTU = 840; // 14:00
const TOLERANSI_MENIT = 5;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// --- FUNGSI LENGKAP: Mencari file secara rekursif ---
function findJsonFilesRecursive(dir) {
  let jsonFiles = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        jsonFiles = [...jsonFiles, ...findJsonFilesRecursive(fullPath)];
      } else if (entry.name.endsWith(".json")) {
        jsonFiles.push(fullPath);
      }
    }
  } catch (error) {
    log(`⚠️  Gagal membaca direktori: ${dir}. Error: ${error.message}`);
  }
  return jsonFiles;
}

const logTypeMap = { 0: "in", 1: "out", 2: "break-in", 3: "break-out" };

async function migrate() {
  log("🚀 Memulai proses migrasi data absensi...");
  let connection;
  try {
    connection = await db.getConnection();
    log("✅ Koneksi database berhasil dibuat.");

    const files = findJsonFilesRecursive(BASE_JSON_DIR);
    if (files.length === 0) {
      log("🟡 Tidak ada file JSON yang ditemukan. Proses selesai.");
      return;
    }
    log(`📄 Ditemukan ${files.length} file JSON untuk diproses.`);

    let totalSummaryRecords = 0;
    let totalRawRecords = 0;

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      log(`--------------------------------------------------`);
      log(`🔄 Memproses file: ${fileName}`);
      const content = fs.readFileSync(filePath, "utf-8");
      const jsonData = JSON.parse(content);
      const [year, month] = fileName.replace(".json", "").split("-").map(Number);

      if (!jsonData.u || !Array.isArray(jsonData.u)) {
        log(`🟡 Peringatan: Format JSON tidak valid di file ${fileName}. Melewatkan...`);
        continue;
      }

      for (const user of jsonData.u) {
        const username = user.n;
        if (!username || !Array.isArray(user.d)) continue;

        for (const [index, dailyRecord] of user.d.entries()) {
          const dayOfMonth = index + 1;
          if (
            typeof dailyRecord !== "object" ||
            !dailyRecord ||
            !Array.isArray(dailyRecord.l) ||
            dailyRecord.l.length === 0
          ) {
            continue;
          }

          const date = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(
            2,
            "0"
          )}`;
          const dayOfWeek = new Date(date).getDay();

          const logs = dailyRecord.l;

          const checkIns = logs.filter((log) => log[1] === 0).map((log) => log[0]);
          const earliestCheckInMinutes = checkIns.length > 0 ? Math.min(...checkIns) : null;

          const checkOuts = logs.filter((log) => log[1] === 1).map((log) => log[0]);
          const latestCheckOutMinutes = checkOuts.length > 0 ? Math.max(...checkOuts) : null;

          // --- LOGIKA LENGKAP: Menghitung keterlambatan dan lembur ---
          let lateness = 0;
          if (earliestCheckInMinutes) {
            const lateThreshold = JAM_KERJA_MULAI + TOLERANSI_MENIT;
            if (earliestCheckInMinutes > lateThreshold) {
              lateness = earliestCheckInMinutes - JAM_KERJA_MULAI;
            }
          }

          let overtime = 0;
          if (latestCheckOutMinutes) {
            const workEndTime = dayOfWeek === 6 ? JAM_KERJA_SELESAI_SABTU : JAM_KERJA_SELESAI;
            if (latestCheckOutMinutes > workEndTime) {
              overtime = latestCheckOutMinutes - workEndTime;
            }
          }

          // --- FUNGSI LENGKAP: Mengubah menit menjadi format waktu ---
          const minutesToTime = (minutes) => {
            if (minutes === null || typeof minutes === "undefined") return null;
            const h = Math.floor(minutes / 60)
              .toString()
              .padStart(2, "0");
            const m = (minutes % 60).toString().padStart(2, "0");
            return `${h}:${m}:00`;
          };

          await connection.beginTransaction();
          try {
            const summarySql = `
                        INSERT INTO attendance_logs (username, date, check_in, check_out, lateness_minutes, overtime_minutes)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE check_in=VALUES(check_in), check_out=VALUES(check_out), lateness_minutes=VALUES(lateness_minutes), overtime_minutes=VALUES(overtime_minutes)
                    `;
            const [summaryResult] = await connection.query(summarySql, [
              username,
              date,
              minutesToTime(earliestCheckInMinutes),
              minutesToTime(latestCheckOutMinutes),
              lateness,
              overtime,
            ]);

            const summaryId =
              summaryResult.insertId ||
              (
                await connection.query(
                  "SELECT id FROM attendance_logs WHERE username = ? AND date = ?",
                  [username, date]
                )
              )[0][0].id;
            totalSummaryRecords++;

            await connection.query("DELETE FROM attendance_raw_logs WHERE attendance_log_id = ?", [
              summaryId,
            ]);

            const rawLogsToInsert = logs.map((log) => [
              summaryId,
              minutesToTime(log[0]),
              logTypeMap[log[1]] || "unknown",
            ]);

            if (rawLogsToInsert.length > 0) {
              const rawSql = `INSERT INTO attendance_raw_logs (attendance_log_id, log_time, log_type) VALUES ?`;
              await connection.query(rawSql, [rawLogsToInsert]);
              totalRawRecords += rawLogsToInsert.length;
            }

            await connection.commit();
          } catch (err) {
            await connection.rollback();
            log(`❌ Gagal memproses data untuk ${username} pada ${date}: ${err.message}`);
          }
        }
      }
    }
    log(`--------------------------------------------------`);
    log(
      `🎉 Migrasi Selesai! ${totalSummaryRecords} ringkasan dan ${totalRawRecords} log mentah berhasil diproses.`
    );
  } catch (error) {
    log("❌ Terjadi error fatal selama proses migrasi:");
    console.error(error);
  } finally {
    if (connection) connection.release();
    await db.end();
    log("🚪 Koneksi database ditutup.");
  }
}

migrate();
