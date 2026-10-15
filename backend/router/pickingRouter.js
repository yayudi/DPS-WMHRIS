// backend/router/pickingRouter.js
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

// Middleware
import { canAccess } from "../middleware/permissionMiddleware.js";

// Controllers
import * as pickingController from "../controllers/pickingController.js";
import AppError from "../utils/AppError.js";
import { validate } from "../middleware/validate.js";
import { completeItemsSchema } from "../validators/pickingValidator.js";
import { createDiskStorage } from "../utils/multerUtils.js";

const router = express.Router();

// --- KONFIGURASI MULTER ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR_SALES = path.join(__dirname, "..", "uploads", "sales_reports");
const salesStorage = createDiskStorage(UPLOAD_DIR_SALES);

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
router.get("/stock-requirements", pickingController.getStockRequirements);
router.get("/stock-requirements/:sku/orders", pickingController.getStockRequirementOrders);
router.get("/:id", pickingController.getPickingDetail); // Detail Modal

// UPLOAD & PROCESS (Core Logic)
router.post(
  "/upload-and-validate",
  canAccess("upload-picking-list"),
  uploadSales.array("files", 20), // Support Multiple Files
  pickingController.uploadAndValidate,
);

// ACTIONS (User Operations)
router.post(
  "/complete-items",
  canAccess("confirm-picking-list"),
  validate(completeItemsSchema),
  pickingController.completeItems,
);
router.post("/void/:id", canAccess("void-picking-list"), pickingController.voidPickingList);
router.put("/:id/items", canAccess("confirm-picking-list"), pickingController.updatePickingItems);
router.post("/retry-backorders-batch", pickingController.retryBackordersBatch);
router.post("/:id/retry-backorders", pickingController.retryBackorders);

// LEGACY FALLBACK (Opsional)
router.post("/upload-sales-report", (req, res, next) => {
  next(new AppError("API Deprecated. Use /upload-and-validate", 410));
});

export default router;
