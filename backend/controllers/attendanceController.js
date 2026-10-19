import catchAsync from "../utils/catchAsync.js";
// backend/controllers/attendanceController.js
import { createJobService } from "../services/jobService.js";
import db from "../config/db.js";
import { IMPORT_JOB_TYPE } from "../config/jobConstants.js";
import { loadHolidays } from "../services/helpers/fileHelpers.js";
import * as attendanceService from "../services/attendanceService.js";
import AppError from "../utils/AppError.js";
import {
  JAM_KERJA_MULAI,
  JAM_KERJA_SELESAI,
  JAM_KERJA_SELESAI_SABTU,
} from "../config/wmsConstants.js";
// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get attendance history (Realtime Log).
 * @param {object} req
 * @param {object} res
 */
export const getHistory = catchAsync(async (req, res, next) => {
  const { startDate, endDate, search } = req.query;

  const data = await attendanceService.getHistory(startDate, endDate, search);
  res.json({ success: true, data: data.logs });
});

/**
 * Get available year/month indexes for attendance data.
 * Used for filtering dropdowns in Frontend.
 */
export const getIndexes = catchAsync(async (req, res, next) => {
  const query = `
          SELECT DISTINCT YEAR(date) AS year, MONTH(date) AS month
          FROM attendance_logs
          ORDER BY year DESC, month DESC
      `;
  const [rows] = await db.query(query);
  const indexes = {};
  for (const row of rows) {
    if (!indexes[row.year]) indexes[row.year] = [];
    if (!indexes[row.year].includes(row.month)) {
      indexes[row.year].push(row.month);
    }
  }
  res.json(indexes);
});

/**
 * Get attendance data by Date Range.
 * Fetches holidays, users, logs, and raw logs for efficient frontend processing.
 */
export const getRangeData = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const start = new Date(startDate);
    const end = new Date(endDate);

    // 1. Ambil data libur (Load holidays for both years if range spans years)
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    let holidayMap = await loadHolidays(startYear);

    if (endYear !== startYear) {
      const endHolidayMap = await loadHolidays(endYear);
      holidayMap = { ...holidayMap, ...endHolidayMap };
    }

    // 2. Ambil semua user aktif (untuk normalisasi data frontend jika log kosong)
    const [allUsers] = await db.query(
      "SELECT id, username FROM users WHERE is_active = TRUE AND exclude_from_attendance = FALSE ORDER BY username ASC",
    );

    // 3. Ambil log absensi + raw logs (JOIN)
    const logQuery = `
      SELECT
        al.id, al.username, u.id as user_id, al.date, al.check_in, al.check_out,
        al.lateness_minutes, al.overtime_minutes, al.notes, al.status,
        arl.log_time, arl.log_type
      FROM attendance_logs al
      JOIN users u ON al.username = u.username
      LEFT JOIN attendance_raw_logs arl ON al.id = arl.attendance_log_id
      WHERE al.date BETWEEN ? AND ?
        AND u.exclude_from_attendance = FALSE
      ORDER BY al.username, al.date, arl.log_time;
    `;
    const [logRows] = await db.query(logQuery, [startDate, endDate]);

    // 4. Hitung Info Global (Total Hari Kerja Ideal)
    let totalIdealWorkMinutes = 0,
      hariKerja = 0,
      hariLibur = 0;

    // Iterate daries start date to end date
    const current = new Date(start);
    while (current <= end) {
      const ymd = current.toISOString().split("T")[0];
      const dayOfWeek = current.getDay();

      if (dayOfWeek === 0 || holidayMap[ymd]) {
        hariLibur++;
        // Skip increment work minutes
      } else {
        hariKerja++;
        if (dayOfWeek === 6) totalIdealWorkMinutes += JAM_KERJA_SELESAI_SABTU - JAM_KERJA_MULAI;
        else totalIdealWorkMinutes += JAM_KERJA_SELESAI - JAM_KERJA_MULAI;
      }
      current.setDate(current.getDate() + 1);
    }

    // 5. Kirim Response
    const responseJson = {
      allUsers: allUsers,
      logRows: logRows,
      globalInfo: {
        idealMinutes: totalIdealWorkMinutes,
        workDays: hariKerja,
        holidayDays: hariLibur,
        holidayMap: holidayMap,
      },
    };

    res.json(responseJson);
});

/**
 * Get monthly attendance data (Summary & Detail).
 * Fetches holidays, users, logs, and raw logs for efficient frontend processing.
 */
export const getMonthlyData = catchAsync(async (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  // 1. Ambil data libur
  const holidayMap = await loadHolidays(year);

    // 2. Ambil semua user aktif (untuk normalisasi data frontend jika log kosong)
    const [allUsers] = await db.query(
      "SELECT id, username FROM users WHERE is_active = TRUE AND exclude_from_attendance = FALSE ORDER BY username ASC",
    );

    // 3. Ambil log absensi + raw logs (JOIN)
    const logQuery = `
      SELECT
        al.id, al.username, u.id as user_id, al.date, al.check_in, al.check_out,
        al.lateness_minutes, al.overtime_minutes, al.notes, al.status,
        arl.log_time, arl.log_type
      FROM attendance_logs al
      JOIN users u ON al.username = u.username
      LEFT JOIN attendance_raw_logs arl ON al.id = arl.attendance_log_id
      WHERE YEAR(al.date) = ? AND MONTH(al.date) = ?
        AND u.exclude_from_attendance = FALSE
      ORDER BY al.username, al.date, arl.log_time;
    `;
    const [logRows] = await db.query(logQuery, [year, month]);

    // 4. Hitung Info Global (Total Hari Kerja Ideal)
    let totalIdealWorkMinutes = 0,
      hariKerja = 0,
      hariLibur = 0;

    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      if (dayOfWeek === 0 || holidayMap[ymd]) {
        hariLibur++;
        continue;
      }

      hariKerja++;
      if (dayOfWeek === 6) totalIdealWorkMinutes += JAM_KERJA_SELESAI_SABTU - JAM_KERJA_MULAI;
      else totalIdealWorkMinutes += JAM_KERJA_SELESAI - JAM_KERJA_MULAI;
    }

    // 5. Kirim Response
    const responseJson = {
      allUsers: allUsers,
      logRows: logRows,
      globalInfo: {
        idealMinutes: totalIdealWorkMinutes,
        workDays: hariKerja,
        holidayDays: hariLibur,
        holidayMap: holidayMap,
      },
    };

    res.json(responseJson);
});

// ============================================================================
// WRITE OPERATIONS (UPLOAD)
// ============================================================================

/**
 * Upload Attendance File (Job Queue Based).
 * Supports Dry Run mode via req.body.dryRun.
 */
export const uploadAttendanceLogs = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("No file uploaded", 400));
  }

  const userId = req.user.id;
  // Deteksi flag dryRun dari form-data (dikirim sebagai string 'true'/'false')
  const isDryRun = req.body.dryRun === "true" || req.body.dryRun === true;

  // Tentukan Tipe Job berdasarkan Mode
  const jobType = isDryRun ? `${IMPORT_JOB_TYPE.ATTENDANCE}_DRY_RUN` : IMPORT_JOB_TYPE.ATTENDANCE;

  const userNotes = req.body.notes ? req.body.notes.trim() : "";
  const defaultNotes = isDryRun ? "Simulasi Import Absensi (Dry Run)" : "Import Absensi";
  const finalNotes = userNotes ? `${defaultNotes} | ${userNotes}` : defaultNotes;

  // Create Job di Database via JobService
  const jobId = await createJobService({
    userId,
    type: jobType,
    originalname: req.file.originalname,
    serverFilePath: req.file.path,
    notes: finalNotes,
  });

  res.json({
    success: true,
    message: isDryRun
      ? "Simulasi validasi berjalan di background..."
      : "File masuk antrian pemrosesan.",
    jobId: jobId,
  });
});

/**
 * Update attendance log manually.
 */
export const updateLog = catchAsync(async (req, res, next) => {
  const { username, date, timeIn, timeOut, status, notes } = req.body;

  const result = await attendanceService.updateAttendance(username, date, {
    timeIn,
    timeOut,
    status,
    notes,
  });

  res.json({ success: true, message: "Data updated successfully", data: result });
});
