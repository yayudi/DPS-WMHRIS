// backend/services/attendanceImportService.js
import { parseCsvToUserData, extractDateFromCsv } from "./parsers/attendanceParser.js";
import Logger from "../utils/logger.js";
import { timeToMinutes, minutesToTime } from "../utils/dateUtils.js";

const logTypeMap = { in: "in", out: "out", "break-in": "break-in", "break-out": "break-out" };

/**
 * Service utama untuk memproses file absensi.
 * Menangani parsing CSV, validasi periode, dan penyimpanan ke database (Attendance Log & Raw Log).
 */
export async function processAttendanceImport(
  connection,
  filePath,
  userId, // Parameter ini WAJIB ADA agar urutan argumen sesuai dengan caller
  originalFilename,
  updateProgress,
  isDryRun = false,
  options = {},
) {
  let logSummary;
  const errors = [];
  const stats = { success: 0, failed: 0, skipped: 0 };
  const filenameStr = String(originalFilename);

  Logger.info("START PROCESS", "ATTENDANCE_IMPORT");
  Logger.info(`  - File: ${filenameStr}`, "ATTENDANCE_IMPORT");
  Logger.info(`  - User ID: ${userId}`, "ATTENDANCE_IMPORT");
  Logger.info(`  - DryRun Mode: ${isDryRun} (${typeof isDryRun})`, "ATTENDANCE_IMPORT");
  Logger.info(`  - DB Connection ID: ${connection.threadId}`, "ATTENDANCE_IMPORT");

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
        Logger.warn("Gagal baca metadata file", "ATTENDANCE_IMPORT", e);
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
          "Gagal mendeteksi periode tanggal. Pastikan header valid atau nama file mengandung tanggal.",
        );
      }
    }
    Logger.info(`Periode Terdeteksi: ${year}-${month}`, "ATTENDANCE_IMPORT");

    // 2. Parse Data User dari CSV
    const { data: parsedData, headerRowIndex } = await parseCsvToUserData(filePath, options.mapping || options);
    const totalUsers = Object.keys(parsedData).length;

    if (totalUsers === 0) {
      return {
        logSummary: "File kosong atau format tidak dikenali (0 user).",
        errors: [{ row: 0, message: "Data kosong." }],
        stats,
      };
    }

    // 2.5 Prepare User Shifts Cache (Bulk Fetch)

    const userShiftMap = {};
    const defaultShiftResult = await connection.query(
      "SELECT * FROM shifts WHERE is_default = 1 LIMIT 1",
    );
    let defaultShift = defaultShiftResult[0][0];

    // Fallback hardcoded if DB is empty (safety)
    if (!defaultShift) {
      defaultShift = {
        start_time: "08:00:00",
        end_time: "16:00:00",
        flexible_minutes: 0,
        work_days: "1,2,3,4,5",
      };
    }

    // Fetch all users shifts
    const userNamesInFile = Object.values(parsedData).map((u) => u.nama || `User-${u.id}`);

    if (userNamesInFile.length > 0) {
      // Use IN clause safely
      const placeholders = userNamesInFile.map(() => "?").join(",");
      const shiftQuery = `
            SELECT u.username, s.*
            FROM users u
            JOIN shifts s ON u.shift_id = s.id
            WHERE u.username IN (${placeholders})
        `;
      const [userShifts] = await connection.query(shiftQuery, userNamesInFile);

      if (Array.isArray(userShifts)) {
        userShifts.forEach((row) => {
          userShiftMap[row.username] = row;
        });
      }
    }

    // 2.6 Prepare Schedules Cache (Bulk Fetch)
    const userScheduleMap = {}; // username -> dateStr -> shift

    // Calculate Date Range for Schedule Fetch
    const allExampleDates = [];
    Object.values(parsedData).forEach((u) => {
      Object.keys(u.days).forEach((d) => {
        allExampleDates.push(d); // d is already 'YYYY-MM-DD' from parser
      });
    });

    if (allExampleDates.length > 0 && userNamesInFile.length > 0) {
      // Find min/max date
      allExampleDates.sort();
      const minDate = allExampleDates[0];
      const maxDate = allExampleDates[allExampleDates.length - 1];

      // Fetch schedules
      const placeholders = userNamesInFile.map(() => "?").join(",");
      const scheduleQuery = `
            SELECT u.username, us.date, s.*
            FROM user_schedules us
            JOIN users u ON us.user_id = u.id
            JOIN shifts s ON us.shift_id = s.id
            WHERE u.username IN (${placeholders})
            AND us.date BETWEEN ? AND ?
        `;
      // Flatten params
      const params = [...userNamesInFile, minDate, maxDate];
      const [schedules] = await connection.query(scheduleQuery, params);

      if (Array.isArray(schedules)) {
        schedules.forEach((row) => {
          if (!userScheduleMap[row.username]) userScheduleMap[row.username] = {};
          const d = new Date(row.date);
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          userScheduleMap[row.username][dStr] = row;
        });
      }
    }


    // Proses Database (Transactional) per-user
    let totalProcessedDays = 0;
    let dbInsertCount = 0;

    for (const idKey in parsedData) {
      await connection.beginTransaction();
      let userProcessedDays = 0;
      let userInsertCount = 0;
      const user = parsedData[idKey];
      const username = user.nama || `User-${user.id}`;

      try {
        const defaultUserShift = userShiftMap[username] || defaultShift;

        // Update progress bar
        if (typeof updateProgress === "function") {
          await updateProgress(totalProcessedDays, totalUsers * 30);
        }

        for (const dayKey in user.days) {
          const dailyLog = user.days[dayKey];

          // dayKey sudah berformat 'YYYY-MM-DD' dari parser
          const dateStr = dayKey;

          // Determine Specific Shift (Schedule > Default)
          let shift = defaultUserShift;
          if (userScheduleMap[username] && userScheduleMap[username][dateStr]) {
            shift = userScheduleMap[username][dateStr];
          }

          const shiftStartMin = timeToMinutes(shift.start_time);
          const shiftEndMin = timeToMinutes(shift.end_time);
          const tolerance = shift.flexible_minutes || 0;

          // Hitung Jam Masuk & Pulang
          const checkIns = dailyLog.l.filter((log) => log.y === "in").map((log) => log.m);
          const earliestCheckIn = checkIns.length > 0 ? Math.min(...checkIns) : null;

          const checkOuts = dailyLog.l.filter((log) => log.y === "out").map((log) => log.m);
          const latestCheckOut = checkOuts.length > 0 ? Math.max(...checkOuts) : null;

          // Hitung Keterlambatan
          let lateness = 0;
          if (earliestCheckIn) {
            if (earliestCheckIn > shiftStartMin + tolerance) {
              lateness = earliestCheckIn - shiftStartMin;
            }
          }

          // Hitung Lembur
          let overtime = 0;
          if (latestCheckOut) {
            if (latestCheckOut > shiftEndMin) {
              overtime = latestCheckOut - shiftEndMin;
            }
          }


          // INSERT DB (Hanya jika BUKAN Dry Run)
          if (isDryRun === false) {
            const summarySql = `
            INSERT INTO attendance_logs (username, date, check_in, check_out, lateness_minutes, overtime_minutes, status)
            VALUES (?, ?, ?, ?, ?, ?, 'HADIR')
            ON DUPLICATE KEY UPDATE
              check_in=VALUES(check_in),
              check_out=VALUES(check_out),
              lateness_minutes=VALUES(lateness_minutes),
              overtime_minutes=VALUES(overtime_minutes),
              status='HADIR'
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
                [username, dateStr],
              );
              if (rows.length > 0) summaryId = rows[0].id;
            }

            // Insert Raw Logs (Hapus data lama hari ini -> Insert baru)
            if (summaryId) {
              await connection.query(
                "DELETE FROM attendance_raw_logs WHERE attendance_log_id = ?",
                [summaryId],
              );

              const rawValues = dailyLog.l.map((log) => [
                summaryId,
                minutesToTime(log.m),
                logTypeMap[log.y] || "unknown",
              ]);

              if (rawValues.length > 0) {
                await connection.query(
                  "INSERT INTO attendance_raw_logs (attendance_log_id, log_time, log_type) VALUES ?",
                  [rawValues],
                );
              }
              userInsertCount++; // Increment counter
            }
          }
          userProcessedDays++;
        }

        if (isDryRun === true) {
          await connection.rollback();
        } else {
          await connection.commit();
          dbInsertCount += userInsertCount;
        }
        totalProcessedDays += userProcessedDays;
      } catch (err) {
        await connection.rollback();
        Logger.error(`Error processing attendance for ${username}`, err, "ATTENDANCE_IMPORT");
        if (user.sourceRows && user.sourceRows.length > 0) {
          user.sourceRows.forEach((row) => {
            errors.push({ row, error: err.message, message: `Error untuk user ${username}: ${err.message}` });
          });
        } else {
          errors.push({ error: err.message, message: `Error untuk user ${username}: ${err.message}` });
        }
      }
    }

    if (isDryRun === true) {
      Logger.info("Mode Dry Run Selesai", "ATTENDANCE_IMPORT");
      logSummary = `[SIMULASI SUKSES] Validasi ${totalProcessedDays} hari kerja untuk ${totalUsers} karyawan.`;
    } else {
      Logger.info(`Mode LIVE Selesai. ${dbInsertCount} hari kerja tersimpan.`, "ATTENDANCE_IMPORT");
      logSummary = `Sukses: ${totalProcessedDays} data hari kerja, ${totalUsers} karyawan.`;
    }

    stats.success = totalProcessedDays;
    stats.failed = errors.length;
    Logger.info(`Selesai. ${logSummary}`, "ATTENDANCE_IMPORT");

    return {
      success: true,
      dryRun: isDryRun,
      logSummary,
      errors,
      stats,
      headerRowIndex,
    };
  } catch (error) {
    if (connection) await connection.rollback();
    Logger.error("Fatal Error", error, "ATTENDANCE_IMPORT");
    throw error;
  }
}
