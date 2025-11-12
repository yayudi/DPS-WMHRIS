// backend/router/reportRouter.js
import express from "express";
import {
  requestStockReport,
  getUserExportJobs,
  fetchReportFilters,
} from "../controllers/reportController.js";
import authenticateToken from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Endpoint untuk MEMINTA laporan (bukan mengunduh)
// Ini hanya INSERT ke SQL (sangat cepat)
router.post(
  "/request-export-stock",
  authenticateToken,
  canAccess("view-reports"),
  requestStockReport
);

// Endpoint untuk melihat status pekerjaan dan link unduh
router.get("/my-jobs", authenticateToken, canAccess("view-reports"), getUserExportJobs);

// [TETAP ADA] Rute untuk mengambil data filter (UI tetap perlu ini)
router.get("/filters", authenticateToken, canAccess("view-reports"), fetchReportFilters);

export default router;
