// backend\server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import db from "./config/db.js";

// Impor semua router Anda
import authRoutes from "./router/auth.js";
import userRoutes from "./router/user.js";
import adminRoutes from "./router/admin.js";
import cronRouter from "./router/cronRouter.js";
import assetsRouter from "./router/assetsRouter.js";
import attendanceRouter from "./router/attendanceRouter.js";
import productRoutes from "./router/productRouter.js";
import stockRoutes from "./router/stockRouter.js";
import locationRoutes from "./router/locationRouter.js";
import realtimeRouter from "./router/realtimeRouter.js";
import roleRoutes from "./router/roleRouter.js";
import pickingRouter from "./router/pickingRouter.js";

import authenticateToken from "./middleware/authMiddleware.js";
import { canAccess } from "./middleware/permissionMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedOrigins = ["https://office.pusatpneumatic.com", "http://localhost:5173"];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Domain ini tidak diizinkan oleh CORS"));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// --- Buat base router untuk semua API ---
const apiRouter = express.Router();

// Daftarkan semua rute API di bawah apiRouter
apiRouter.use("/auth", authRoutes);
apiRouter.use("/products", authenticateToken, productRoutes);
apiRouter.use("/locations", authenticateToken, locationRoutes);
apiRouter.use("/stock", authenticateToken, stockRoutes);
apiRouter.use("/attendance", authenticateToken, attendanceRouter);
apiRouter.use("/user", authenticateToken, userRoutes);
apiRouter.use("/admin/users", authenticateToken, canAccess("manage-users"), adminRoutes);
apiRouter.use("/admin/roles", authenticateToken, canAccess("manage-roles"), roleRoutes);
apiRouter.use("/cron", authenticateToken, cronRouter);
apiRouter.use("/realtime", authenticateToken, realtimeRouter);
apiRouter.use("/picking", authenticateToken, pickingRouter);

// Rute tes "canary" sekarang juga bagian dari API di /api/test
apiRouter.get("/test", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 + 1 AS solution");
    res.status(200).json({ success: true, message: "Koneksi database berhasil!", data: rows[0] });
  } catch (error) {
    console.error("--- TES KONEKSI DB GAGAL ---", error);
    res
      .status(500)
      .json({ success: false, message: "Gagal terhubung ke database.", error: error.message });
  }
});

// Gunakan apiRouter di bawah prefix '/api'
app.use("/api", apiRouter);

// --- Rute non-API (seperti aset) bisa tetap di luar ---
app.use("/", assetsRouter);

// Middleware untuk menangani 404 (harus di bagian paling akhir)
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server backend berjalan di http://localhost:${PORT}`);
});
