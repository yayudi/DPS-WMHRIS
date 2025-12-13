// backend/router/returnRouter.js
import express from "express";
import { canAccess } from "../middleware/permissionMiddleware.js";
import * as returnController from "../controllers/returnController.js";

const router = express.Router();

// GET: List Barang Pending Retur
router.get("/pending", returnController.getPendingReturns);

// GET: List Riwayat Retur Barang
router.get("/history", returnController.getReturnHistory);

// POST: Input Retur Manual
router.post(
  "/manual-entry",
  canAccess("manage-stock-adjustment"),
  returnController.createManualReturn
);

// POST: Approve & Restock
router.post("/approve", canAccess("manage-stock-adjustment"), returnController.approveReturn);

export default router;
