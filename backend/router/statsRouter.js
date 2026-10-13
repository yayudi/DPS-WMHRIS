// backend/router/statsRouter.js
import express from "express";
import { fetchKpiSummary } from "../controllers/statsController.js";
import authenticateToken from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.route("/kpi-summary").get(authenticateToken, canAccess("view-reports"), fetchKpiSummary);

export default router;
