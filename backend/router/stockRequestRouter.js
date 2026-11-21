// backend/router/stockRequestRouter.js
import express from "express";
import * as stockRequestController from "../controllers/stockRequestController.js";
import authenticateToken from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";
import { validate } from "../middleware/validate.js";
import {
  bulkActionStockRequestSchema,
  completeStockRequestSchema,
  createStockRequestSchema,
  getStockRequestsQuerySchema,
  stockRequestIdParamSchema,
} from "../validators/stockRequestValidator.js";

const router = express.Router();

// Semua route di sini wajib login
router.use(authenticateToken);

// ============================================================================
// STOCK REQUESTS API
// ============================================================================

/**
 * GET /api/stock-requests
 * Mengambil daftar permintaan stok
 */
router.get("/", validate(getStockRequestsQuerySchema, "query"), stockRequestController.getStockRequests);

/**
 * POST /api/stock-requests
 * Membuat permintaan stok baru
 */
router.post("/", validate(createStockRequestSchema), stockRequestController.createStockRequest);

/**
 * POST /api/stock-requests/bulk-action
 * Memproses aksi massal pada permintaan stok
 */
router.post(
  "/bulk-action",
  canAccess(["approve-stock-requests"]),
  validate(bulkActionStockRequestSchema),
  stockRequestController.bulkActionStockRequest
);

/**
 * POST /api/stock-requests/:id/approve
 * Menyetujui permintaan stok. Menggunakan permission khusus.
 */
router.post(
  "/:id/approve",
  canAccess(["approve-stock-requests"]),
  validate(stockRequestIdParamSchema, "params"),
  stockRequestController.approveStockRequest
);

/**
 * POST /api/stock-requests/:id/reject
 * Menolak permintaan stok. Menggunakan permission khusus.
 */
router.post(
  "/:id/reject",
  canAccess(["approve-stock-requests"]),
  validate(stockRequestIdParamSchema, "params"),
  stockRequestController.rejectStockRequest
);

/**
 * POST /api/stock-requests/:id/dispatch
 * Mengirim barang permintaan stok. Menggunakan permission khusus.
 */
router.post(
  "/:id/dispatch",
  canAccess(["approve-stock-requests"]),
  validate(stockRequestIdParamSchema, "params"),
  stockRequestController.dispatchStockRequest
);

/**
 * POST /api/stock-requests/:id/complete
 * Menerima barang dan menyelesaikan permintaan.
 */
router.post(
  "/:id/complete",
  validate(stockRequestIdParamSchema, "params"),
  validate(completeStockRequestSchema),
  stockRequestController.completeStockRequest
);

export default router;
