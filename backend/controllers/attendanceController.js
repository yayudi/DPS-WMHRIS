// backend/controllers/attendanceController.js
import { createJobService } from "../services/jobService.js";
import path from "path";
import db from "../config/db.js";
import { loadHolidays } from "../services/helpers/fileHelpers.js";

// Konfigurasi Jam Kerja (Hardcoded sementara, idealnya dari DB Config)
const JAM_KERJA_MULAI = 480; // 08:00
const JAM_KERJA_SELESAI = 960; // 16:00
const JAM_KERJA_SELESAI_SABTU = 840; // 14:00

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get available year/month indexes for attendance data.
 * Used for filtering dropdowns in Frontend.
 */
export const getIndexes = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error fetching attendance indexes:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil indeks data absensi." });
  }
};

/**
 * Get monthly attendance data (Summary & Detail).
 * Fetches holidays, users, logs, and raw logs for efficient frontend processing.
 */
export const getMonthlyData = async (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res
      .status(400)
      .json({ success: false, message: "Format tahun atau bulan tidak valid." });
  }

  try {
    // 1. Ambil data libur
    const holidayMap = await loadHolidays(year);

    // 2. Ambil semua user aktif (untuk normalisasi data frontend jika log kosong)
    const [allUsers] = await db.query("SELECT id, username FROM users WHERE is_active = TRUE");

    // 3. Ambil log absensi + raw logs (JOIN)
    const logQuery = `
      SELECT
        al.id, al.username, u.id as user_id, al.date, al.check_in, al.check_out,
        al.lateness_minutes, al.overtime_minutes,
        arl.log_time, arl.log_type
      FROM attendance_logs al
      JOIN users u ON al.username = u.username
      LEFT JOIN attendance_raw_logs arl ON al.id = arl.attendance_log_id
      WHERE YEAR(al.date) = ? AND MONTH(al.date) = ?
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
  } catch (error) {
    console.error(`Error fetching attendance data for ${year}-${month}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil data absensi." });
  }
};

// ============================================================================
// WRITE OPERATIONS (UPLOAD)
// ============================================================================

/**
 * Upload Attendance File (Job Queue Based).
 * Supports Dry Run mode via req.body.dryRun.
 */
export const uploadAttendanceLogs = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const userId = req.user.id;
    // Deteksi flag dryRun dari form-data (dikirim sebagai string 'true'/'false')
    const isDryRun = req.body.dryRun === "true" || req.body.dryRun === true;

    // Tentukan Tipe Job berdasarkan Mode
    const jobType = isDryRun ? "IMPORT_ATTENDANCE_DRY_RUN" : "IMPORT_ATTENDANCE";

    // Create Job di Database via JobService
    const jobId = await createJobService({
      userId,
      type: jobType,
      originalname: req.file.originalname,
      serverFilePath: req.file.path,
      // Catatan otomatis:
      notes: isDryRun ? "Simulasi Import Absensi (Dry Run)" : "Import Absensi",
    });

    res.json({
      success: true,
      message: isDryRun
        ? "Simulasi validasi berjalan di background..."
        : "File masuk antrian pemrosesan.",
      jobId: jobId,
    });
  } catch (error) {
    console.error("[Attendance] Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
