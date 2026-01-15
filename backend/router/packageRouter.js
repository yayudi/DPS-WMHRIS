import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { canAccess } from "../middleware/permissionMiddleware.js";
import * as packageController from "../controllers/packageController.js";

const router = express.Router();

// ============================================================================
// ✅ CONFIGURATION (Shared Uploads Directory)
// ============================================================================
const uploadDir = "uploads/imports/";
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    console.error(`[System] Failed to create folder ${uploadDir}:`, err);
  }
}

// Setup Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "package-update-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// ============================================================================
// ✅ ROUTES
// ============================================================================

/**
 * GET /api/packages/export
 * Export Data Paket ke Excel (Job)
 */
router.get("/export", canAccess("manage-products"), packageController.exportPackages);

/**
 * POST /api/packages/batch/update
 * Upload Revision File Paket (Job)
 */
router.post(
  "/batch/update",
  canAccess("manage-products"),
  upload.single("file"),
  packageController.importPackagesBatch
);

export default router;
