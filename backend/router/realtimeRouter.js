// backend\router\realtimeRouter.js
import express from "express";

const router = express.Router();

/**
 * [NON-AKTIF] Endpoint SSE dimatikan untuk stabilitas Shared Hosting.
 * Route ini tetap ada untuk menangani sisa request dari cache browser lama
 * agar tidak pending, melainkan langsung selesai (respon 200 OK).
 */
router.get("/stock-updates", (req, res) => {
  res.status(200).json({
    status: "disabled",
    mode: "polling",
    message: "Realtime features disabled. Please rely on auto-refetch.",
  });
});

/**
 * [DUMMY FUNCTION]
 * Fungsi ini harus tetap diexport agar Controller lain (seperti stockController)
 * yang meng-import 'broadcastStockUpdate' tidak mengalami error "Module not found".
 *
 * Isinya kosong (no-op) karena kita tidak perlu lagi membroadcast data.
 */
export function broadcastStockUpdate(updatedProducts) {
  // Tidak melakukan apa-apa.
  // Console log opsional untuk debugging dev mode saja:
  console.log(`[INFO] Stock updated for ${updatedProducts.length} items (Polling Mode)`);
}

export default router;
