// backend\server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import db from "./config/db.js";

import authRoutes from "./router/auth.js";
import userRoutes from "./router/user.js";
import adminRoutes from "./router/admin.js";
import attendanceRouter from "./router/attendanceRouter.js"; // Router baru kita

import authenticateToken from "./middleware/authMiddleware.js";
import { canAccess } from "./middleware/permissionMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? "https://office.pusatpneumatic.com"
      : "http://localhost:5173",
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Rute tes sederhana (tanpa /api)
app.get("/test", async (req, res) => {
  try {
    // Coba lakukan query yang paling sederhana
    const [rows] = await db.query("SELECT 1 + 1 AS solution");
    console.log("Hasil tes DB:", rows);
    res.status(200).json({ success: true, message: "Koneksi database berhasil!", data: rows[0] });
  } catch (error) {
    console.error("--- TES KONEKSI DB GAGAL ---", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal terhubung ke database.", error: error.message });
  }
});

// --- Rute Aplikasi (semua prefix /api dihapus) ---
app.use("/auth", authRoutes);
app.use("/user", authenticateToken, userRoutes);
app.use("/admin/users", authenticateToken, canAccess("manage-users"), adminRoutes);
app.use("/attendance", authenticateToken, attendanceRouter); // ✅ Rute baru ditambahkan

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server backend berjalan di http://localhost:${PORT}`);
});
