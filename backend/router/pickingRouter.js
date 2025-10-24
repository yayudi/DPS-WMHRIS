import express from "express";
import db from "../config/db.js";
import multer from "multer";
import fs from "fs";
import { parsePdf } from "../services/pdf.js";

const router = express.Router();
const upload = multer({ dest: "tmp/" });

/**
 * @param {string} textContent - Teks mentah dari file PDF.
 * @returns {Array} - Array hasil parsing.
 */
// --- ENGINE PARSING TOKOPEDIA ---
function parseTokopediaPdfText(textContent) {
  if (!textContent) return [];
  console.log(
    "\n--- DEBUG: Teks Mentah dari PDF ---\n",
    textContent,
    "\n---------------------------------\n"
  );
  const items = [];
  // (PP\d+)   : Menangkap SKU yang diawali "PP" diikuti angka.
  // \s+        : Mencocokkan satu atau lebih spasi/tab/baris baru.
  // (\d+)      : Menangkap angka kuantitas.
  // /g         : Flag global untuk menemukan semua kecocokan.
  const productRegex = /(PP\d+)\s+(\d+)/g;
  let match;
  while ((match = productRegex.exec(textContent)) !== null) {
    const sku = match[1]?.trim();
    const qty = parseInt(match[2]?.trim(), 10);
    if (sku && !isNaN(qty)) {
      items.push({ sku, qty });
    }
  }
  console.log("[Tokopedia Parser] Ditemukan item:", items);
  return items;
}

// --- ENGINE PARSING SHOPEE ---
function parseShopeePdfText(textContent) {
  if (!textContent) return [];
  console.log("[Parser] Menggunakan engine parsing Shopee...");

  // --- PERBAIKAN: Regex pra-pemrosesan yang lebih fleksibel ---
  // Regex ini mencari pola (PP diikuti angka), lalu spasi/baris baru, lalu angka lagi,
  // dan menggabungkannya. Ini akan menangani kasus seperti "PP0002\n721" dan "PP00027\n21".
  const cleanedText = textContent.replace(/(PP\d+)\s*\r?\n\s*(\d+)/g, "$1$2");

  console.log(
    "\n--- DEBUG: Teks Shopee Setelah Dibersihkan ---\n",
    cleanedText,
    "\n---------------------------------\n"
  );

  const items = [];
  // Regex baru yang lebih tangguh:
  // (PP\d{7})          : Menangkap SKU (PP + 7 digit).
  // [\s\S]*?           : Mencocokkan karakter apa pun (termasuk baris baru dan nama variasi) secara non-greedy.
  // (\d+)              : Menangkap Kuantitas (angka).
  // \s+[A-Z0-9]{14,}   : Diikuti oleh spasi dan No. Pesanan (string alfanumerik panjang) sebagai jangkar.
  const productRegex = /(PP\d{7})[\s\S]*?\s(\d+)\s+[A-Z0-9]{14,}/g;

  let match;
  while ((match = productRegex.exec(cleanedText)) !== null) {
    const sku = match[1]?.trim();
    const qty = parseInt(match[2]?.trim(), 10);

    if (sku && !isNaN(qty)) {
      const existingItem = items.find((item) => item.sku === sku);
      if (existingItem) {
        existingItem.qty += qty;
      } else {
        items.push({ sku, qty });
      }
    }
  }
  console.log(`[Parser] Ditemukan ${items.length} item unik.`);
  return items;
}

// --- ENGINE PARSING OFFLINE ---
function parseOfflinePdfText(textContent) {
  if (!textContent) return [];
  console.log("[Parser] Menggunakan engine parsing Offline/Surat Jalan...");

  const items = [];
  // Regex: Mencari baris yang diawali angka, spasi, lalu (SKU),
  // diikuti teks apa pun, dan diakhiri dengan (Kuantitas) di ujung baris.
  const productRegex = /^\s*\d+\s+(PP\d{7})[\s\S]*?(\d+)\s*$/gm;

  let match;
  while ((match = productRegex.exec(textContent)) !== null) {
    const sku = match[1]?.trim();
    const qty = parseInt(match[2]?.trim(), 10);

    if (sku && !isNaN(qty)) {
      items.push({ sku, qty });
    }
  }
  console.log(`[Parser] Ditemukan ${items.length} item.`);
  return items;
}

/**
 * POST /api/picking/upload
 */
router.post("/upload", upload.single("pickingListFile"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Tidak ada file yang di-upload." });
  }
  const { source } = req.body;
  if (!["Tokopedia", "Shopee", "Offline"].includes(source)) {
    return res.status(400).json({ success: false, message: "Sumber tidak valid." });
  }

  let connection;
  try {
    let textContent;
    if (req.file.mimetype === "application/pdf") {
      textContent = await parsePdf(req.file.path);
    } else {
      textContent = fs.readFileSync(req.file.path, "utf-8");
    }

    let parsedItems;
    // --- LOGIKA KONDISIONAL BARU UNTUK MEMILIH PARSER ---
    if (source === "Tokopedia") {
      parsedItems = parseTokopediaPdfText(textContent);
    } else if (source === "Shopee") {
      parsedItems = parseShopeePdfText(textContent);
    } else if (source === "Offline") {
      parsedItems = parseOfflinePdfText(textContent);
    } else {
      throw new Error(`Parser untuk sumber '${source}' belum diimplementasikan.`);
    }

    if (parsedItems.length === 0) {
      throw new Error("Tidak ada item valid yang bisa diparsing dari file. Cek format file.");
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [pickingListResult] = await connection.query(
      "INSERT INTO picking_lists (user_id, source, original_filename, status) VALUES (?, ?, ?, ?)",
      [req.user.id, source, req.file.originalname, "PENDING_VALIDATION"]
    );
    const pickingListId = pickingListResult.insertId;
    const validationResults = { pickingListId, validItems: [], invalidSkus: [] };
    for (const item of parsedItems) {
      const [productRows] = await connection.query(
        `
          SELECT p.id, p.name, COALESCE(sl.quantity, 0) as current_stock
          FROM products p
          LEFT JOIN stock_locations sl ON p.id = sl.product_id
          LEFT JOIN locations l ON sl.location_id = l.id AND l.building = 'Pajangan'
          WHERE p.sku = ?
          GROUP BY p.id
        `,
        [item.sku]
      );
      if (productRows.length > 0) {
        const product = productRows[0];
        await connection.query(
          "INSERT INTO picking_list_items (picking_list_id, product_id, original_sku, quantity) VALUES (?, ?, ?, ?)",
          [pickingListId, product.id, item.sku, item.qty]
        );
        validationResults.validItems.push({
          ...item,
          name: product.name,
          current_stock: product.current_stock,
        });
      } else {
        validationResults.invalidSkus.push(item.sku);
      }
    }
    await connection.commit();
    res.status(200).json({ success: true, data: validationResults });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat memproses picking list:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Gagal menghapus file temporary:", err);
      });
    }
  }
});

/**
 * POST /api/picking/:id/confirm
 */
router.post("/:id/confirm", async (req, res) => {
  // --- BLOK DEBUG UNTUK INVESTIGASI ---
  console.log("\n--- DEBUG: Proses Konfirmasi Picking List Dimulai ---");
  console.log(`Timestamp: ${new Date().toLocaleTimeString()}`);
  console.log("Content-Type Header:", req.headers["content-type"]); // Log header
  console.log("Request Body Mentah:", JSON.stringify(req.body, null, 2));
  // --- AKHIR BLOK DEBUG ---

  const { id } = req.params;
  // --- PERBAIKAN: Akses 'items' secara eksplisit ---
  const items = req.body.items;
  const userId = req.user.id;

  const SOURCE_LOCATION_BUILDING = "Pajangan";

  if (!Array.isArray(items) || items.length === 0) {
    console.log("❌ Validasi Gagal: `req.body.items` bukan array atau kosong.");
    return res
      .status(400)
      .json({ success: false, message: "Tidak ada item yang dipilih untuk diproses." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    console.log("✅ Koneksi DB berhasil, memulai transaksi...");
    await connection.beginTransaction();

    const [pajanganLocations] = await connection.query(
      `SELECT id FROM locations WHERE building = ? LIMIT 1`,
      [SOURCE_LOCATION_BUILDING]
    );
    if (pajanganLocations.length === 0) {
      throw new Error(`Lokasi sumber '${SOURCE_LOCATION_BUILDING}' tidak ditemukan.`);
    }
    const fromLocationId = pajanganLocations[0].id;

    for (const item of items) {
      const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [
        item.sku,
      ]);
      if (productRows.length === 0) {
        throw new Error(`SKU '${item.sku}' tidak ditemukan saat konfirmasi.`);
      }
      const productId = productRows[0].id;
      const quantityToPick = item.qty;

      // Langsung kurangi stok tanpa memeriksa, sesuai permintaan
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity - ?",
        [productId, fromLocationId, -quantityToPick, quantityToPick]
      );

      await connection.query(
        "INSERT INTO stock_movements (product_id, quantity, from_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [productId, quantityToPick, fromLocationId, "SALE", userId, `Sale from picking list #${id}`]
      );
    }

    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["COMPLETED", id]);

    await connection.commit();
    console.log("✅ Transaksi berhasil di-commit.");
    res.status(200).json({
      success: true,
      message: `Berhasil memproses ${items.length} item. Stok telah diperbarui.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat konfirmasi picking list:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal mengonfirmasi picking list." });
  } finally {
    if (connection) connection.release();
  }
});

router.get("/history", async (req, res) => {
  try {
    const query = `
      SELECT pl.id, pl.source, pl.status, pl.original_filename, pl.created_at, u.username
      FROM picking_lists pl
      JOIN users u ON pl.user_id = u.id
      ORDER BY pl.created_at DESC
      LIMIT 100;
    `;
    const [history] = await db.query(query);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("Error saat mengambil riwayat picking list:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat." });
  }
});

/**
 * --- ENDPOINT BARU ---
 * GET /api/picking/:id/details
 * Mengambil semua item detail dari sebuah picking list spesifik.
 */
router.get("/:id/details", async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT pli.original_sku as sku, p.name, pli.quantity as qty
      FROM picking_list_items pli
      JOIN products p ON pli.product_id = p.id
      WHERE pli.picking_list_id = ?
    `;
    const [items] = await db.query(query, [id]);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error(`Error saat mengambil detail picking list #${id}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil detail item." });
  }
});

/**
 * --- ENDPOINT BARU ---
 * POST /api/picking/:id/void
 * Membatalkan picking list yang sudah selesai dan mengembalikan stok.
 */
router.post("/:id/void", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const SOURCE_LOCATION_BUILDING = "Pajangan";

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 1. Kunci dan periksa status picking list
    const [listRows] = await connection.query(
      "SELECT status FROM picking_lists WHERE id = ? FOR UPDATE",
      [id]
    );
    if (listRows.length === 0 || listRows[0].status !== "COMPLETED") {
      throw new Error("Hanya picking list yang sudah 'COMPLETED' yang bisa dibatalkan.");
    }

    // 2. Ambil semua item yang akan dikembalikan
    const [itemsToVoid] = await connection.query(
      "SELECT * FROM picking_list_items WHERE picking_list_id = ?",
      [id]
    );

    // 3. Ambil ID lokasi pajangan
    const [pajanganLocations] = await connection.query(
      `SELECT id FROM locations WHERE building = ? LIMIT 1`,
      [SOURCE_LOCATION_BUILDING]
    );
    if (pajanganLocations.length === 0)
      throw new Error(`Lokasi sumber '${SOURCE_LOCATION_BUILDING}' tidak ditemukan.`);
    const locationId = pajanganLocations[0].id;

    // 4. Lakukan transaksi terbalik untuk setiap item
    for (const item of itemsToVoid) {
      // Tambahkan kembali stok
      await connection.query(
        "UPDATE stock_locations SET quantity = quantity + ? WHERE product_id = ? AND location_id = ?",
        [item.quantity, item.product_id, locationId]
      );
      // Catat pergerakan sebagai pembatalan
      await connection.query(
        "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [
          item.product_id,
          item.quantity,
          locationId,
          "VOID_SALE",
          userId,
          `Void sale from picking list #${id}`,
        ]
      );
    }

    // 5. Update status picking list menjadi 'CANCELLED'
    await connection.query("UPDATE picking_lists SET status = ? WHERE id = ?", ["CANCELLED", id]);

    await connection.commit();
    res.status(200).json({
      success: true,
      message: "Transaksi picking list berhasil dibatalkan dan stok telah dikembalikan.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat membatalkan picking list:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Gagal membatalkan transaksi." });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
