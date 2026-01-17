// backend\server.js
import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "./config/db.js";
import { logDebug } from "./utils/logger.js";

import apiRouter from "./router/index.js";
import assetsRouter from "./router/assetsRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// [FIX V5] Enable Trust Proxy for Reverse Proxies (Cloudflare/Nginx)
// Ensure req.protocol detects 'https' correctly
app.set('trust proxy', true);

// ==================================================================
// [FIX CORS V5] Konfigurasi CORS Permissive
// ==================================================================
// Mengatasi masalah "CORS request did not succeed" di Shared Hosting.
// Kita menggunakan strategi "Reflect Origin" (callback null, true) yang
// mengizinkan browser apapun untuk connect, selama credentials match.
const corsOptions = {
  origin: function (origin, callback) {
    // Selalu izinkan origin apapun.
    // Ini diperlukan jika whitelist strict (string match) gagal karena protokol http/https
    // atau trailing slash.
    callback(null, true);
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  credentials: true, // Wajib true agar cookies/auth header dikirim
  allowedHeaders: "Content-Type, Authorization, X-Requested-With, Accept",
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle Preflight (OPTIONS) requests
app.use(express.json());

// ==================================================================
// [DEBUGGER V5] Middleware Logger untuk Download
// ==================================================================
// Mencatat request download file untuk memastikan file ada di disk.
app.use("/uploads", (req, res, next) => {
  try {
    const requestedPath = req.path;
    const safePath = decodeURIComponent(requestedPath);
    const absolutePath = path.join(__dirname, "uploads", safePath);

    let fileStatus = "MISSING (File tidak ditemukan di disk)";
    let fileSize = 0;

    if (fs.existsSync(absolutePath)) {
      const stats = fs.statSync(absolutePath);
      fileSize = stats.size;
      fileStatus = `FOUND (Size: ${fileSize} bytes)`;
    }

    logDebug(`[DOWNLOAD REQUEST] Frontend meminta: /uploads${safePath}`, {
      serverLookingAt: absolutePath,
      status: fileStatus,
      clientIP: req.ip,
    });
  } catch (err) {
    console.error("Logger Error:", err);
  }
  next(); // Lanjut ke express.static
});

// ==================================================================
// [PRIORITY FIX] Static File Serving
// ==================================================================
// Melayani file statis dari folder 'uploads'.
// Ditaruh SEBELUM router lain untuk menghindari 404 palsu.
// Melayani file statis dari folder 'uploads'.
// Ditaruh SEBELUM router lain untuk menghindari 404 palsu.
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res, filePath) => {
    // 1. Logging saat file benar-benar dikirim native oleh Express
    console.log(`[STATIC SERVE] Sending: ${path.basename(filePath)}`);

    // 2. Force Download dengan nama file yang benar
    // Ini memperbaiki masalah nama file UUID/Blob di browser
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  }
}));

// Routing API Utama
app.use("/api", apiRouter);
app.use("/", assetsRouter);

// 404 Handler Global
app.use((req, res) => {
  // Hanya log jika bukan request favicon/robots.txt yang annoying
  if (!req.originalUrl.includes("favicon") && !req.originalUrl.includes("robots")) {
    logDebug(`[404 MISSING] URL tidak ditemukan: ${req.originalUrl}`);
  }
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server backend berjalan di http://localhost:${PORT}`);
  console.log(`📂 Serving static uploads from: ${path.join(__dirname, "uploads")}`);
  console.log(`🔓 CORS Policy: Permissive (All Origins Allowed)`);
});
