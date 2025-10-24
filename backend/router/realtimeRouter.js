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
  // 1. Siapkan header untuk koneksi SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // Kirim header segera

  // 2. Tambahkan klien ini ke daftar pendengar
  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res: res,
  };
  clients.push(newClient);
  console.log(`[SSE] Klien baru terhubung. Total: ${clients.length}`);

  // 3. Kirim pesan "keep-alive" setiap 20 detik untuk menjaga koneksi
  const keepAliveInterval = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 20000);

  // 4. Hapus klien dari daftar jika koneksi terputus
  req.on("close", () => {
    clearInterval(keepAliveInterval);
    clients = clients.filter((client) => client.id !== clientId);
    console.log(`[SSE] Klien terputus. Sisa: ${clients.length}`);
  });
});

/**
 * Fungsi untuk menyiarkan pembaruan stok ke semua klien yang terhubung.
 * Fungsi ini akan dipanggil dari stockRouter.js setelah ada perubahan.
 * @param {Array} updatedProducts - Array produk yang stoknya baru saja berubah.
 */
export function broadcastStockUpdate(updatedProducts) {
  if (clients.length === 0) return;

  console.log(
    `[SSE] Menyiarkan pembaruan untuk ${updatedProducts.length} produk ke ${clients.length} klien...`
  );
  const message = `data: ${JSON.stringify(updatedProducts)}\n\n`;

  clients.forEach((client) => client.res.write(message));
}

export default router;
