import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import db from "./config/db.js";

import apiRouter from "./router/index.js";
import assetsRouter from "./router/assetsRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const allowedOrigins = ["https://wms.dpvindonesia.com", "http://localhost:5173"];

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
  allowedHeaders: "Content-Type, Authorization",
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Gunakan apiRouter di bawah prefix '/api'
app.use("/api", apiRouter);

// --- Rute non-API (seperti aset) bisa tetap di luar ---
app.use("/", assetsRouter);

// ==================================================================
// [FIX 404] Sajikan file yang diekspor secara statis
// ==================================================================
// Ini memberitahu Express:
// "Jika ada permintaan yang dimulai dengan /exports, sajikan file itu
// dari direktori 'backend/tmp/exports' di disk."
const exportsDir = path.join(__dirname, "tmp", "exports");

// **** TAMBAHAN DEBUGGING ****
console.log(`[Server] Menyajikan file statis untuk '/exports' dari: ${exportsDir}`);
// **** -------------------- ****

app.use("/exports", express.static(exportsDir));
// ==================================================================

// Middleware untuk menangani 404 (harus di bagian paling akhir)
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server backend berjalan di http://localhost:${PORT}`);
});
