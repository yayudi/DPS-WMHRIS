// backend/router/attendanceRouter.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs"; // Tambahkan fs untuk memastikan folder ada
import { canAccess } from "../middleware/permissionMiddleware.js";
import * as attendanceController from "../controllers/attendanceController.js";

const router = express.Router();

// --- KONFIGURASI UPLOAD (MULTER) ---
// Pastikan folder upload ada
const uploadDir = "uploads/attendance/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "csvFile-" + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// ============================================================================
// DEFINISI RUTE
// ============================================================================

/**
 * GET /indexes
 * Mengambil daftar Tahun & Bulan yang tersedia di database.
 */
router.get("/indexes", attendanceController.getIndexes);

/**
 * POST /upload
 * Mengupload file absensi (CSV/Excel) untuk diproses via Job Queue.
 * Middleware:
 * 1. Cek Permission ('manage-attendance')
 * 2. Handle File Upload (multer)
 * 3. Controller (Buat Job)
 */
router.post(
  "/upload",
  canAccess("manage-attendance"),
  upload.single("csvFile"),
  attendanceController.uploadAttendanceLogs
);

/**
 * GET /:year/:month
 * Mengambil data absensi bulanan (Summary & Detail Log).
 */
router.get("/:year/:month", attendanceController.getMonthlyData);

/**
 * GET /history
 * Mengambil data history absensi realtime berdasarkan range tanggal.
 */
router.get("/history", attendanceController.getHistory);

export default router;
