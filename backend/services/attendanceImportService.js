// backend/services/attendanceImportService.js
import db from "../config/db.js";
import { parseCsvToUserData, extractDateFromCsv } from "./parsers/attendanceParser.js";
import {
  JAM_KERJA_MULAI,
  JAM_KERJA_SELESAI,
  JAM_KERJA_SELESAI_SABTU,
  TOLERANSI_MENIT,
} from "../config/wmsConstants.js";

const logTypeMap = { in: "in", out: "out", "break-in": "break-in", "break-out": "break-out" };

/**
 * Service utama untuk memproses file absensi.
 * Menangani parsing CSV, validasi periode, dan penyimpanan ke database (Attendance Log & Raw Log).
 */
export async function processAttendanceImport(
  connection,
  filePath,
  userId, // ✅ Parameter ini WAJIB ADA agar urutan argumen sesuai dengan caller
  originalFilename,
  updateProgress,
  isDryRun = false,
  options = {}
) {
  // --- DEBUG ARGUMENTS ---
  // Cek apakah argumen sudah sesuai
  if (typeof isDryRun === "function") {
    console.error("[AttendanceService] ⚠️ CRITICAL: Argument Mismatch! 'isDryRun' is a function.");
    console.error("DEBUG ARGS:", {
      userId,
      originalFilename,
      typeProgress: typeof updateProgress,
      typeDry: typeof isDryRun,
    });
    // Auto-fix darurat (Shift Right)
    // Jika userId menerima filename, dan originalFilename menerima function...
    // Kita asumsikan caller mengirim (conn, path, filename, progress, dry, opts) tanpa userId
    // TAPI log anda menunjukkan userId masuk ke originalFilename.
    // Jadi caller mengirim (conn, path, userId, filename, progress, dry, opts)
    // TAPI service ini mungkin sebelumnya (conn, path, originalFilename, ...)
    // Dengan menambahkan 'userId' kembali di parameter function di atas, masalah ini harusnya selesai.
  }

  let logSummary = "";
  const errors = [];
  const stats = { success: 0, failed: 0, skipped: 0 };
  const filenameStr = String(originalFilename);

  console.log(`\n[AttendanceService] 🚀 START PROCESS`);
  console.log(`  - File: ${filenameStr}`);
  console.log(`  - User ID: ${userId}`);
  console.log(`  - DryRun Mode: ${isDryRun} (${typeof isDryRun})`);
  console.log(`  - DB Connection ID: ${connection.threadId}`);

  try {
    // 1. Tentukan Periode (Tahun & Bulan)
    let year, month;

    // A. Cek dari Options (Prioritas Utama - dari Metadata Pre-processing)
    const pStart = options.periodStart || options.startDate || options.start_date || options.from;

    if (pStart) {
      const dateParts = pStart.split(/[-/]/);
      if (dateParts.length === 3) {
        year = parseInt(dateParts[0]);
        month = parseInt(dateParts[1]);
      }
    }

    // B. Fallback: Cek dari Nama File Virtual
    if (!year || !month) {
      const nameMatch = filenameStr.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
      if (nameMatch) {
        year = parseInt(nameMatch[1]);
        month = parseInt(nameMatch[2]);
      }
    }

    // C. Fallback Terakhir: Baca Metadata Header dari Isi File
    if (!year || !month) {
      try {
        const meta = await extractDateFromCsv(filePath);
        if (meta && meta.year) {
          year = meta.year;
          month = meta.month;
        }
      } catch (e) {
        console.warn("[AttendanceService] Gagal baca metadata file:", e.message);
      }
    }

    // Validasi Akhir Periode
    if (!year || !month) {
      if (options.dateRange && options.dateRange.min) {
        const d = new Date(options.dateRange.min);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
          month = d.getMonth() + 1;
        }
      }
      if (!year || !month) {
        throw new Error(
          "Gagal mendeteksi periode tanggal. Pastikan header valid atau nama file mengandung tanggal."
        );
      }
    }
    console.log(`[AttendanceService] Periode Terdeteksi: ${year}-${month}`);

    // 2. Parse Data User dari CSV
    const { data: parsedData } = await parseCsvToUserData(filePath);
    const totalUsers = Object.keys(parsedData).length;

    if (totalUsers === 0) {
      return {
        logSummary: "File kosong atau format tidak dikenali (0 user).",
        errors: [{ row: 0, message: "Data kosong." }],
        stats,
      };
    }

    // 3. Proses Database (Transactional)
    await connection.beginTransaction();
    let totalProcessedDays = 0;
    let dbInsertCount = 0; // Debug counter

    for (const idKey in parsedData) {
      const user = parsedData[idKey];
      const username = user.nama || `User-${user.id}`;

      // Update progress bar
      if (typeof updateProgress === "function") {
        await updateProgress(totalProcessedDays, totalUsers * 30);
      }

      for (const dayKey in user.days) {
        const dayOfMonth = parseInt(dayKey);
        const dailyLog = user.days[dayKey];

        // Konstruksi Tanggal YYYY-MM-DD
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(
          2,
          "0"
        )}`;
        const dateObj = new Date(dateStr);
        const dayOfWeek = dateObj.getDay();

        // Hitung Jam Masuk & Pulang
        const checkIns = dailyLog.l.filter((log) => log.y === "in").map((log) => log.m);
        const earliestCheckIn = checkIns.length > 0 ? Math.min(...checkIns) : null;

        const checkOuts = dailyLog.l.filter((log) => log.y === "out").map((log) => log.m);
        const latestCheckOut = checkOuts.length > 0 ? Math.max(...checkOuts) : null;

        // Hitung Keterlambatan
        let lateness = 0;
        if (earliestCheckIn) {
          const lateThreshold = JAM_KERJA_MULAI + TOLERANSI_MENIT;
          if (earliestCheckIn > lateThreshold) {
            lateness = earliestCheckIn - JAM_KERJA_MULAI;
          }
        }

        // Hitung Lembur
        let overtime = 0;
        if (latestCheckOut) {
          const workEndTime = dayOfWeek === 6 ? JAM_KERJA_SELESAI_SABTU : JAM_KERJA_SELESAI;
          if (latestCheckOut > workEndTime) {
            overtime = latestCheckOut - workEndTime;
          }
        }

        const minutesToTime = (minutes) => {
          if (minutes === null || minutes === undefined) return null;
          const h = Math.floor(minutes / 60)
            .toString()
            .padStart(2, "0");
          const m = (minutes % 60).toString().padStart(2, "0");
          return `${h}:${m}:00`;
        };

        // INSERT DB (Hanya jika BUKAN Dry Run)
        if (isDryRun === false) {
          const summarySql = `
            INSERT INTO attendance_logs (username, date, check_in, check_out, lateness_minutes, overtime_minutes)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              check_in=VALUES(check_in),
              check_out=VALUES(check_out),
              lateness_minutes=VALUES(lateness_minutes),
              overtime_minutes=VALUES(overtime_minutes)
          `;

          const [summaryResult] = await connection.query(summarySql, [
            username,
            dateStr,
            minutesToTime(earliestCheckIn),
            minutesToTime(latestCheckOut),
            lateness,
            overtime,
          ]);

          // Ambil ID untuk Foreign Key Raw Logs
          let summaryId = summaryResult.insertId;
          if (!summaryId) {
            const [rows] = await connection.query(
              "SELECT id FROM attendance_logs WHERE username = ? AND date = ?",
              [username, dateStr]
            );
            if (rows.length > 0) summaryId = rows[0].id;
          }

          // Insert Raw Logs (Hapus data lama hari ini -> Insert baru)
          if (summaryId) {
            await connection.query("DELETE FROM attendance_raw_logs WHERE attendance_log_id = ?", [
              summaryId,
            ]);

            const rawValues = dailyLog.l.map((log) => [
              summaryId,
              minutesToTime(log.m),
              logTypeMap[log.y] || "unknown",
            ]);

            if (rawValues.length > 0) {
              await connection.query(
                "INSERT INTO attendance_raw_logs (attendance_log_id, log_time, log_type) VALUES ?",
                [rawValues]
              );
            }
            dbInsertCount++; // Increment counter
          }
        }
        totalProcessedDays++;
      }
    }

    if (isDryRun === true) {
      console.log(`[AttendanceService] Mode Dry Run: Rollback transaksi.`);
      await connection.rollback();
      logSummary = `[SIMULASI SUKSES] Validasi ${totalProcessedDays} hari kerja untuk ${totalUsers} karyawan. Data valid.`;
    } else {
      await connection.commit();
      console.log(
        `[AttendanceService] Mode LIVE: Commit transaksi berhasil. ${dbInsertCount} hari kerja tersimpan.`
      );
      logSummary = `Sukses: ${totalProcessedDays} data hari kerja, ${totalUsers} karyawan.`;
    }

    stats.success = totalProcessedDays;
    console.log(`[AttendanceService] Selesai. ${logSummary}`);

    return { logSummary, errors, stats };
  } catch (error) {
    await connection.rollback();
    console.error("[AttendanceService] Fatal Error:", error);
    throw error;
  }
}
