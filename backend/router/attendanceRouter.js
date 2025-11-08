import express from "express";
import multer from "multer";
import { canAccess } from "../middleware/permissionMiddleware.js";
import { processAttendanceFile } from "../services/attendanceParser.js";
import db from "../config/db.js";
import path from "path";
import { loadHolidays } from "../services/fileHelpers.js";

const router = express.Router();

const JAM_KERJA_SELESAI = 960; // 16:00
const JAM_KERJA_SELESAI_SABTU = 840; // 14:00
const JAM_KERJA_MULAI = 480; // 08:00

// Endpoint ini (GET /indexes) sudah benar dan tidak perlu diubah.
router.get("/indexes", async (req, res) => {
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
});

// Endpoint upload (POST /upload) juga sudah benar dan tidak perlu diubah.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "tmp/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });
router.post(
  "/upload",
  canAccess("manage-attendance"),
  upload.single("csvFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "Tidak ada file yang di-upload." });
      }
      const result = await processAttendanceFile(req.file.path, req.file.originalname);
      res.status(200).json(result);
    } catch (error) {
      console.error("--- UPLOAD/PARSE ERROR ---", error);
      res.status(500).json({ success: false, message: "Terjadi kesalahan internal pada server." });
    }
  }
);

// --- ✅ VERSI BERSIH (CARA NO. 2) ---
// Versi ini mengirim data SQL mentah (TANPA artefak 'u', 'i', 'd')
router.get("/:year/:month", async (req, res) => {
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

    // 2. Ambil *semua* user. Kita butuh ini nanti di frontend (normalize)
    const [allUsers] = await db.query("SELECT id, username FROM users WHERE is_active = TRUE");

    // 3. Ambil semua log absensi untuk bulan ini
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

    // 4. Hitung Info Global
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

    // 5. Kirim respons yang bersih (tanpa 'u', 'i', 'd')
    const responseJson = {
      allUsers: allUsers, // Mengirim daftar semua user
      logRows: logRows, // Mengirim data SQL mentah
      globalInfo: {
        // Mengirim info global
        idealMinutes: totalIdealWorkMinutes,
        workDays: hariKerja,
        holidayDays: hariLibur,
        holidayMap: holidayMap, // Kirim holidayMap ke frontend
      },
    };

    res.json(responseJson);
  } catch (error) {
    console.error(`Error fetching attendance data for ${year}-${month}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil data absensi." });
  }
});

export default router;
