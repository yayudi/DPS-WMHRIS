// backend\router\index.js
import { Router } from "express";

// Impor semua router Anda
import authRoutes from "./auth.js";
import userRoutes from "./user.js";
import adminRoutes from "./admin.js";
import attendanceRouter from "./attendanceRouter.js";
import productRoutes from "./productRouter.js";
import stockRoutes from "./stockRouter.js";
import locationRoutes from "./locationRouter.js";
import realtimeRouter from "./realtimeRouter.js";
import roleRoutes from "./roleRouter.js";
import pickingRouter from "./pickingRouter.js";
import returnRouter from "./returnRouter.js";
import statsRouter from "./statsRouter.js";
import reportRouter from "./reportRouter.js";
import packageRoutes from "./packageRouter.js";
import jobRoutes from "./jobRouter.js";
import systemLogRoutes from "./systemLogRouter.js";
// import cronRouter from "./cronRouter.js";

// Impor middleware yang diperlukan
import authenticateToken from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";
import db from "../config/db.js"; // Impor db untuk rute /test

const apiRouter = Router();

// Daftarkan semua rute API di bawah apiRouter
// Rute-rute ini sekarang akan dipanggil dengan prefix /api
// (misal: /api/auth, /api/products, dll)
apiRouter.use("/auth", authRoutes);
apiRouter.use("/products", authenticateToken, productRoutes);
apiRouter.use("/locations", authenticateToken, locationRoutes);
apiRouter.use("/stock", authenticateToken, stockRoutes);
apiRouter.use("/attendance", authenticateToken, attendanceRouter);
apiRouter.use("/user", authenticateToken, userRoutes);
apiRouter.use("/admin/users", authenticateToken, canAccess("manage-users"), adminRoutes);
apiRouter.use("/admin/roles", authenticateToken, canAccess("manage-roles"), roleRoutes);
apiRouter.use("/realtime", authenticateToken, realtimeRouter);
apiRouter.use("/picking", authenticateToken, pickingRouter);
apiRouter.use("/returns", authenticateToken, returnRouter);
apiRouter.use("/return", authenticateToken, returnRouter);
apiRouter.use("/stats", authenticateToken, statsRouter);
apiRouter.use("/reports", authenticateToken, reportRouter);
apiRouter.use("/packages", authenticateToken, packageRoutes);
apiRouter.use("/jobs", authenticateToken, jobRoutes);
apiRouter.use("/logs", authenticateToken, canAccess("manage-users"), systemLogRoutes);
// apiRouter.use("/cron", authenticateToken, cronRouter);

// Rute tes "canary"
apiRouter.get("/test", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 + 1 AS solution");
    res.status(200).json({
      success: true,
      message: "Koneksi database berhasil!",
      data: rows[0],
    });
  } catch (error) {
    console.error("--- TES KONEKSI DB GAGAL ---", error);
    res.status(500).json({
      success: false,
      message: "Gagal terhubung ke database.",
      error: error.message,
    });
  }
});

// Rute health check sederhana untuk /api/
apiRouter.get("/", (req, res) => {
  res.json({ message: "Backend API is healthy" });
});

export default apiRouter;
