import fs from "fs";
import csv from "csv-parser";
import db from "../config/db.js"; // Impor koneksi database

// --- LOGIKA BISNIS (Diambil dari skrip Anda) ---
const JAM_KERJA_MULAI = 480; // 08:00
const JAM_KERJA_SELESAI = 960; // 16:00
const JAM_KERJA_SELESAI_SABTU = 840; // 14:00
const TOLERANSI_MENIT = 5;
const logTypeMap = { in: "in", out: "out", "break-in": "break-in", "break-out": "break-out" };
// ---------------------------------------------

/**
 * Fungsi utama yang dipanggil oleh router.
 * Direfaktor untuk memproses file CSV dan menyimpan hasilnya langsung ke dua tabel SQL.
 */
export async function processAttendanceFile(temporaryFilePath, originalFilename) {
  let connection;
  try {
    // Parse CSV mentah menjadi struktur data yang lebih mudah diolah
    const { data: parsedData } = await parseCsvToUserData(temporaryFilePath);

    // Ekstrak tahun dan bulan dari metadata di dalam file CSV
    const { year, month } = await extractDateFromCsv(temporaryFilePath);

    connection = await db.getConnection();

    let totalSummaryRecords = 0;
    let totalRawRecords = 0;

    // Loop melalui setiap pengguna dari hasil parse CSV untuk diolah
    for (const userId in parsedData) {
      const user = parsedData[userId];
      const username = user.nama;

      for (const dayKey in user.days) {
        const dayOfMonth = parseInt(dayKey);
        const dailyLog = user.days[dayKey];
        const date = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(
          2,
          "0"
        )}`;
        const dayOfWeek = new Date(date).getDay();

        // Cari check-in paling awal dan check-out paling akhir dari log harian
        const checkIns = dailyLog.l.filter((log) => log.y === "in").map((log) => log.m);
        const earliestCheckIn = checkIns.length > 0 ? Math.min(...checkIns) : null;

        const checkOuts = dailyLog.l.filter((log) => log.y === "out").map((log) => log.m);
        const latestCheckOut = checkOuts.length > 0 ? Math.max(...checkOuts) : null;

        // Hitung keterlambatan dan lembur berdasarkan logika bisnis Anda
        let lateness = 0;
        if (earliestCheckIn) {
          const lateThreshold = JAM_KERJA_MULAI + TOLERANSI_MENIT;
          if (earliestCheckIn > lateThreshold) {
            lateness = earliestCheckIn - JAM_KERJA_MULAI;
          }
        }

        let overtime = 0;
        if (latestCheckOut) {
          const workEndTime = dayOfWeek === 6 ? JAM_KERJA_SELESAI_SABTU : JAM_KERJA_SELESAI_SABTU;
          if (latestCheckOut > workEndTime) {
            overtime = latestCheckOut - workEndTime;
          }
        }

        const minutesToTime = (minutes) => {
          if (minutes === null) return null;
          const h = Math.floor(minutes / 60)
            .toString()
            .padStart(2, "0");
          const m = (minutes % 60).toString().padStart(2, "0");
          return `${h}:${m}:00`;
        };

        // Simpan ke database dalam satu transaksi
        await connection.beginTransaction();
        try {
          // Langkah 5a: Simpan/update ringkasan harian
          const summarySql = `
                INSERT INTO attendance_logs (username, date, check_in, check_out, lateness_minutes, overtime_minutes)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE check_in=VALUES(check_in), check_out=VALUES(check_out), lateness_minutes=VALUES(lateness_minutes), overtime_minutes=VALUES(overtime_minutes)
            `;
          const [summaryResult] = await connection.query(summarySql, [
            username,
            date,
            minutesToTime(earliestCheckIn),
            minutesToTime(latestCheckOut),
            lateness,
            overtime,
          ]);

          // Dapatkan ID dari baris ringkasan yang baru saja dimasukkan/diperbarui
          const summaryId =
            summaryResult.insertId ||
            (
              await connection.query(
                "SELECT id FROM attendance_logs WHERE username = ? AND date = ?",
                [username, date]
              )
            )[0][0].id;
          totalSummaryRecords++;

          // Hapus log mentah lama dan masukkan yang baru
          await connection.query("DELETE FROM attendance_raw_logs WHERE attendance_log_id = ?", [
            summaryId,
          ]);

          const rawLogsToInsert = dailyLog.l.map((log) => [
            summaryId,
            minutesToTime(log.m),
            logTypeMap[log.y] || "unknown",
          ]);

          if (rawLogsToInsert.length > 0) {
            const rawSql = `INSERT INTO attendance_raw_logs (attendance_log_id, log_time, log_type) VALUES ?`;
            await connection.query(rawSql, [rawLogsToInsert]);
            totalRawRecords += rawLogsToInsert.length;
          }

          await connection.commit();
        } catch (err) {
          await connection.rollback();
          console.error(
            `[Parser] Gagal memproses data DB untuk ${username} pada ${date}: ${err.message}`
          );
        }
      }
    }

    return {
      success: true,
      message: `Upload berhasil. ${totalSummaryRecords} data harian telah diproses.`,
      processed: { year, month },
    };
  } catch (error) {
    console.error("[Parser] Terjadi error fatal:", error);
    throw error;
  } finally {
    if (connection) connection.release();
    try {
      await fs.promises.unlink(temporaryFilePath);
    } catch (e) {
      console.error(`[Parser] Gagal menghapus file temporary: ${temporaryFilePath}`, e);
    }
  }
}

// ==================================================================
// == FUNGSI-FUNGSI HELPER (Diadaptasi dari skrip Anda) ==
// ==================================================================

function parseCsvToUserData(filepath) {
  return new Promise((resolve, reject) => {
    const data = {};

    fs.createReadStream(filepath)
      .pipe(csv({ skipLines: 3, mapHeaders: ({ header }) => header.replace(/\uFEFF/g, "").trim() }))
      .on("data", (row) => {
        const id = row["User ID"]?.trim();
        const nama = row["Full Name"]?.trim();
        const datetime = row["Date/Time"]?.trim();
        if (!id || !nama || !datetime) return;

        const [dateStr, timeStr] = datetime.split(" ");
        const [year, month, day] = dateStr.split("/");
        const dateObj = new Date(`${year}-${month}-${day}T${timeStr}`);
        if (isNaN(dateObj.getTime())) return;

        const dayKey = dateObj.getDate();
        const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();

        if (!data[id]) data[id] = { id: parseInt(id), nama, days: {} };
        if (!data[id].days[dayKey]) data[id].days[dayKey] = { l: [] };

        const logType = determineLogType(minutes, dateObj.getDay(), data[id].days[dayKey].l);

        if (logType) {
          // Simpan waktu dalam menit ('m') dan tipe ('y')
          data[id].days[dayKey].l.push({ m: minutes, y: logType });
        }
      })
      .on("end", () => resolve({ data }))
      .on("error", (error) => reject(error));
  });
}

async function extractDateFromCsv(filepath) {
  const fileContent = await fs.promises.readFile(filepath, "utf8");
  const lines = fileContent.split(/\r?\n/);
  const metaLine = lines.length >= 3 ? lines[2] : "";
  const match = metaLine.match(/From (\d{4})\/(\d{2})\/(\d{2})/);

  if (!match) {
    throw new Error("Format file CSV tidak valid, tidak dapat menemukan rentang tanggal.");
  }
  const [, year, month] = match;
  return { year: parseInt(year), month: parseInt(month) };
}

function determineLogType(minutes, dayOfWeek, existingLogs) {
  if (minutes >= 420 && minutes <= 600) return "in"; // 07:00 - 10:00
  if (minutes >= 690 && minutes <= 780) {
    // 11:30 - 13:00
    const lastLog = existingLogs[existingLogs.length - 1];
    return lastLog && lastLog.y === "break-in" ? "break-out" : "break-in";
  }
  const isSaturday = dayOfWeek === 6;
  if ((!isSaturday && minutes >= 960) || (isSaturday && minutes >= 840)) return "out";
  return null;
}
