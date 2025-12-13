// backend/router/pickingRouter.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Middleware
import { canAccess } from "../middleware/permissionMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";

// Controllers
import * as pickingController from "../controllers/pickingController.js";

const router = express.Router();
router.use(authMiddleware);

// --- KONFIGURASI MULTER ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR_SALES = path.join(__dirname, "..", "uploads", "sales_reports");

if (!fs.existsSync(UPLOAD_DIR_SALES)) {
  fs.mkdirSync(UPLOAD_DIR_SALES, { recursive: true });
}

const salesStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR_SALES),
  filename: (_, file, cb) => {
    // Format: NamaAsli_Timestamp_Unique.ext
    const name = path.parse(file.originalname).name.replace(/[^a-z0-9]/gi, "_");
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${name}_${uniqueSuffix}${ext}`);
  },
});

const uploadSales = multer({
  storage: salesStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".csv", ".xlsx", ".xls"].includes(ext)) return cb(null, true);
    cb(new Error("Format file tidak didukung. Gunakan .csv atau .xlsx"), false);
  },
});

// =====================================================================
// ROUTES DEFINITION
// =====================================================================

// READ DATA (Frontend Tabs)
router.get("/pending-items", pickingController.getPendingItems);
router.get("/history-items", pickingController.getHistoryItems);
router.get("/:id", pickingController.getPickingDetail); // Detail Modal

// UPLOAD & PROCESS (Core Logic)
router.post(
  "/upload-and-validate",
  canAccess("upload-picking-list"),
  uploadSales.array("files", 20), // Support Multiple Files
  pickingController.uploadAndValidate
);

// ACTIONS (User Operations)
router.post("/complete-items", canAccess("confirm-picking-list"), pickingController.completeItems);

router.post("/cancel/:id", canAccess("void-picking-list"), pickingController.cancelPickingList);

// LEGACY FALLBACK (Opsional)
router.post("/upload-sales-report", (req, res) => {
  res.status(410).json({ message: "API Deprecated. Use /upload-and-validate" });
});

export default router;
