import express from "express";
import { canAccess } from "../middleware/permissionMiddleware.js";

import {
  uploadJsonInvoices,
  validateParsedData,
  confirmPickingList,
  voidPickingList,
  cancelPendingPickingList,
  getPickingHistory,
  getPickingListDetails,
} from "../controllers/pickingController.js";

const router = express.Router();

/**
 * [HYBRID CSV] Menerima data JSON 'Tagihan (CSV)' yang sudah di-parse.
 */
router.post(
  "/upload-json",
  canAccess("upload-picking-list"),
  express.json(), // Middleware tetap di sini
  (req, res, next) => {
    // <-- LOG TAMBAHAN 1
    console.log("[PICKING ROUTER] Melewati Auth/JSON, memanggil uploadJsonInvoices.");
    next();
  },
  uploadJsonInvoices // Handler dari controller
);

/**
 * [HYBRID PDF] Menerima hasil parsing PDF (Tokopedia/Shopee) dari client-side.
 */
router.post(
  "/validate-parsed",
  canAccess("upload-picking-list"),
  express.json(), // Middleware tetap di sini
  (req, res, next) => {
    // <-- LOG TAMBAHAN 2
    console.log("[PICKING ROUTER] Melewati Auth/JSON, memanggil validateParsedData.");
    next();
  },
  validateParsedData // Handler dari controller
);

/**
 * Konfirmasi picking list dan kurangi stok.
 */
router.post(
  "/:id/confirm",
  canAccess("confirm-picking-list"),
  confirmPickingList // Handler dari controller
);

/**
 * Membatalkan (void) picking list yang sudah 'COMPLETED'.
 */
router.post(
  "/:id/void",
  canAccess("void-picking-list"),
  voidPickingList // Handler dari controller
);

/**
 * [BARU] Membatalkan picking list yang statusnya 'PENDING'.
 */
router.post(
  "/:id/cancel",
  canAccess("upload-picking-list"), // Asumsi permission, bisa diganti jika perlu
  cancelPendingPickingList // Handler dari controller
);

/**
 * Mengambil riwayat picking list.
 */
router.get(
  "/history",
  getPickingHistory // Handler dari controller
);

/**
 * Mengambil detail item dari sebuah picking list.
 */
router.get(
  "/:id/details",
  getPickingListDetails // Handler dari controller
);

export default router;
