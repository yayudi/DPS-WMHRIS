import express from "express";
import multer from "multer";
import { canAccess } from "../middleware/permissionMiddleware.js";
import { processAttendanceFile } from "../services/attendanceParser.js";
import path from "path";

const router = express.Router();

// Konfigurasi Multer untuk menyimpan file sementara di folder /tmp
// Ini memastikan file yang di-upload diberi nama unik untuk menghindari konflik.
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "tmp/"); // Simpan file di folder /tmp
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

/**
 * Endpoint untuk meng-upload file absensi.
 * Method: POST
 * Path: /attendance/upload
 * Perlindungan: Membutuhkan token autentikasi dan izin 'manage-attendance'.
 */
router.post(
  "/upload",
  canAccess("manage-attendance"), // Menggunakan RBAC Anda yang sudah ada!
  upload.single("csvFile"), // Middleware Multer untuk mengambil satu file bernama 'csvFile'
  async (req, res) => {
    try {
      // Cek apakah file berhasil di-upload oleh Multer
      if (!req.file) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Tidak ada file yang di-upload atau nama field salah.",
          });
      }

      // Panggil logika inti dari service parser, berikan path dari file yang baru di-upload
      const result = await processAttendanceFile(req.file.path, req.file.originalname);

      // Periksa hasil dari parser
      if (!result.success) {
        // Jika parser gagal, kirim pesan error yang spesifik
        return res.status(400).json(result);
      }

      // Jika semua berhasil, kirim respons sukses beserta datanya
      res.status(200).json(result);
    } catch (error) {
      console.error("--- UPLOAD/PARSE ERROR ---", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Terjadi kesalahan internal pada server saat memproses file.",
        });
    }
  }
);

// Anda bisa menambahkan endpoint lain terkait absensi di sini di masa depan
// Contoh: router.get('/summary', canAccess('view-attendance'), ...);

export default router;
