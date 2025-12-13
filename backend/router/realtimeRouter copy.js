// backend\router\realtimeRouter.js
import express from "express";
import db from "../config/db.js";

const router = express.Router();

// Daftar semua klien yang sedang mendengarkan
let clients = [];

/**
 * Endpoint utama untuk Server-Sent Events (SSE).
 * Klien akan terhubung ke sini untuk mendapatkan pembaruan stok.
 */
router.get("/stock-updates", (req, res) => {
  // ==================================================================
  // [FIX V5] Header Khusus Shared Hosting & CORS
  // ==================================================================

  // Force CORS untuk route ini spesifik (Safety Net)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Header standar SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // [CRITICAL] Matikan Buffering Nginx/LiteSpeed
  // Tanpa ini, shared hosting akan menahan data sampai buffer penuh,
  // menyebabkan browser timeout atau error CORS palsu.
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders(); // Kirim header segera

  // Kirim data awal agar browser tahu koneksi sukses
  res.write('data: {"status":"connected"}\n\n');

  // Tambahkan klien ini ke daftar pendengar
  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res: res,
  };
  clients.push(newClient);
  console.log(`[SSE] Klien baru terhubung. Total: ${clients.length}`);

  // Kirim pesan "keep-alive" setiap 20 detik
  const keepAliveInterval = setInterval(() => {
    // Cek apakah koneksi masih bisa ditulis
    if (!res.writableEnded) {
      res.write(": keep-alive\n\n");
    }
  }, 20000);

  // Bersihkan saat koneksi putus
  req.on("close", () => {
    clearInterval(keepAliveInterval);
    clients = clients.filter((client) => client.id !== clientId);
    console.log(`[SSE] Klien terputus. Sisa: ${clients.length}`);
  });
});

/**
 * Fungsi untuk menyiarkan pembaruan stok ke semua klien yang terhubung.
 */
export function broadcastStockUpdate(updatedProducts) {
  if (clients.length === 0) return;

  console.log(
    `[SSE] Menyiarkan pembaruan untuk ${updatedProducts.length} produk ke ${clients.length} klien...`
  );
  const message = `data: ${JSON.stringify(updatedProducts)}\n\n`;

  clients.forEach((client) => {
    // Pastikan koneksi belum mati sebelum menulis
    if (!client.res.writableEnded) {
      client.res.write(message);
    }
  });
}

export default router;
