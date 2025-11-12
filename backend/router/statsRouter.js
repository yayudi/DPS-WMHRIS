// backend/router/statsRouter.js
import express from "express";
import { fetchKpiSummary } from "../controllers/statsController.js";
import authenticateToken from "../middleware/authMiddleware.js"; // Impor default export
import { canAccess } from "../middleware/permissionMiddleware.js"; // Impor named export

const router = express.Router();

// Endpoint untuk mengambil data KPI
router.route("/kpi-summary").get(
  authenticateToken, // Gunakan nama yang konsisten
  canAccess("view-reports"),
  fetchKpiSummary
);

export default router;
