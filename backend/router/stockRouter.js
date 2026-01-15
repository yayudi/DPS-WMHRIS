// backend/router/stockRouter.js
import express from "express";
import * as stockController from "../controllers/stockController.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getTimestampString_YYMMDDHHSS } from "../services/helpers/sharedHelpers.js";

import { canAccess } from "../middleware/permissionMiddleware.js"; // Uncomment jika middleware sudah siap

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path: backend/uploads/adjustments/
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "adjustments");

// Pastikan direktori ada
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error("Gagal membuat folder upload adjustment:", err);
  }
}

// Konfigurasi Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const originalName = path.parse(file.originalname).name;
    const timestamp = getTimestampString_YYMMDDHHSS();
    const ext = path.extname(file.originalname);
    cb(null, `${originalName}_${timestamp}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype;

    if (
      ext !== ".xlsx" ||
      mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return cb(new Error("Hanya file .xlsx yang diizinkan"), false);
    }
    cb(null, true);
  },
});

// ============================================================================
// ✅ STOCK OPERATIONS (Transfer, Adjust, Batch)
// ============================================================================

/**
 * POST /api/stock/transfer
 * Memindahkan stok (Support Auto-Breakdown Paket)
 */
router.post("/transfer", stockController.transferStock);

/**
 * POST /api/stock/adjust
 * Penyesuaian stok (Opname)
 */
router.post("/adjust", stockController.adjustStock);

/**
 * POST /api/stock/batch-process
 * Memproses berbagai jenis pergerakan stok dalam satu request
 */
router.post("/batch-process", stockController.processBatchMovements);

/**
 * POST /api/stock/batch-transfer
 * Transfer banyak item sekaligus
 */
router.post("/batch-transfer", stockController.batchTransfer);

/**
 * POST /api/stock/validate-return
 * Validasi barang retur dari picking list
 */
router.post("/validate-return", stockController.validateReturn);

// ============================================================================
// ✅ READ / HISTORY
// ============================================================================

/**
 * GET /api/stock/history/:productId
 * Riwayat pergerakan stok per produk
 */
router.get("/history/:productId", stockController.getStockHistory);

/**
 * GET /api/stock/batch-log
 * Log batch pergerakan berdasarkan tanggal
 */
router.get("/batch-log", stockController.getBatchLogs);

// ============================================================================
// ✅ IMPORT / EXPORT (Stock Opname)
// ============================================================================

/**
 * GET /api/stock/template/inbound
 * Download template Inbound
 */
router.get("/template/inbound", stockController.getInboundTemplate);

/**
 * POST /api/stock/import-batch
 * Upload file Inbound (Background Job)
 */
router.post("/import-batch", upload.single("file"), stockController.importBatchInbound);

/**
 * GET /api/stock/download-adjustment-template
 * Download template Excel untuk stock opname
 */
router.get("/download-adjustment-template", stockController.downloadAdjustmentTemplate);

/**
 * POST /api/stock/request-adjustment-upload
 * Upload file Excel untuk stock opname (Background Process)
 */
router.post(
  "/request-adjustment-upload",
  upload.single("adjustmentFile"),
  stockController.requestAdjustmentUpload
);

/**
 * GET /api/stock/import-jobs
 * List status job import user
 */
router.get("/import-jobs", stockController.getImportJobs);

/**
 * POST /api/stock/import-jobs/:id/cancel
 * Batalkan job import yang masih pending
 */
router.post("/import-jobs/:id/cancel", stockController.cancelImportJob);

export default router;
