import express from "express";
import multer from "multer";
import { canAccess } from "../middleware/permissionMiddleware.js";
import { processAttendanceFile } from "../services/attendanceParser.js";
import db from "../config/db.js";
import path from "path";

const router = express.Router();

const JAM_KERJA_SELESAI = 960; // 16:00
const JAM_KERJA_SELESAI_SABTU = 840; // 14:00
const JAM_KERJA_MULAI = 480; // 08:00

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
      if (!indexes[row.year]) {
        indexes[row.year] = [];
      }
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

router.get("/:year/:month", async (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res
      .status(400)
      .json({ success: false, message: "Format tahun atau bulan tidak valid." });
  }

  try {
    // --- PERBAIKAN: Tambahkan JOIN ke tabel 'users' untuk mendapatkan user.id ---
    const query = `
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
    const [rows] = await db.query(query, [year, month]);

    if (rows.length === 0) {
      return res.json({ u: [], i: {} });
    }

    const usersData = {};
    for (const row of rows) {
      if (!usersData[row.username]) {
        // --- PERBAIKAN: Sertakan 'i' (user_id) di dalam objek user ---
        usersData[row.username] = { i: row.user_id, n: row.username, d: [] };
      }

      const dayOfMonth = new Date(row.date).getDate();
      if (!usersData[row.username].d[dayOfMonth - 1]) {
        usersData[row.username].d[dayOfMonth - 1] = {
          d: dayOfMonth,
          i: row.check_in,
          o: row.check_out,
          t: row.lateness_minutes,
          e: row.overtime_minutes,
          raw: [],
        };
      }

      if (row.log_time) {
        usersData[row.username].d[dayOfMonth - 1].raw.push({
          time: row.log_time,
          type: row.log_type,
        });
      }
    }

    const finalUsersArray = Object.values(usersData).map((user) => {
      const completedDays = [];
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        completedDays.push(user.d[i - 1] || i);
      }
      user.d = completedDays;
      return user;
    });

    let totalIdealWorkMinutes = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();

      if (dayOfWeek === 0) continue;

      if (dayOfWeek === 6) {
        totalIdealWorkMinutes += JAM_KERJA_SELESAI_SABTU - JAM_KERJA_MULAI;
      } else {
        totalIdealWorkMinutes += JAM_KERJA_SELESAI - JAM_KERJA_MULAI;
      }
    }

    const responseJson = {
      u: finalUsersArray,
      i: { m: totalIdealWorkMinutes },
    };

    res.json(responseJson);
  } catch (error) {
    console.error(`Error fetching attendance data for ${year}-${month}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil data absensi." });
  }
});

export default router;
