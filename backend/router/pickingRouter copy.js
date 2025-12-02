// backend/router/pickingRouter.js
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// Utils & Middleware
import db from "../config/db.js";
import cache from "../config/cache.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";
import { getPickingListDetails } from "../controllers/pickingController.js";
import { getTimestampString_YYMMDDHHSS } from "../services/helpers/sharedHelpers.js";

// V6 services
import {
  performPickingValidation,
  cancelPickingListService,
} from "../services/pickingDataService.js";

const router = express.Router();
router.use(authMiddleware);

/* =====================================================================
   1. KONFIGURASI UPLOAD SALES REPORT
   ===================================================================== */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR_SALES = path.join(__dirname, "..", "uploads", "sales_reports");

if (!fs.existsSync(UPLOAD_DIR_SALES)) {
  fs.mkdirSync(UPLOAD_DIR_SALES, { recursive: true });
}

const salesStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR_SALES),
  filename: (_, file, cb) => {
    const name = path.parse(file.originalname).name;
    const ext = path.extname(file.originalname);
    const timestamp = getTimestampString_YYMMDDHHSS();
    cb(null, `${name}_${timestamp}${ext}`);
  },
});

const uploadSales = multer({
  storage: salesStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const valid = [".csv", ".xlsx"];

    if (valid.includes(ext)) return cb(null, true);
    cb(new Error("Hanya file .csv atau .xlsx yang diizinkan"), false);
  },
});

/* =====================================================================
   2. ROUTE: UPLOAD SALES REPORT (LEGACY)
   ===================================================================== */

router.post(
  "/upload-sales-report",
  canAccess("upload-picking-list"),
  uploadSales.single("salesReportFile"),
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const { file, body, user } = req;
    const { notes, source } = body;

    if (!file) {
      return res.status(400).json({ success: false, message: "File tidak ditemukan." });
    }

    if (!["Tokopedia", "Shopee", "Offline"].includes(source)) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ success: false, message: "Sumber laporan wajib diisi." });
    }

    const jobTypeMap = {
      Tokopedia: "IMPORT_SALES_TOKOPEDIA",
      Shopee: "IMPORT_SALES_SHOPEE",
      Offline: "IMPORT_SALES_OFFLINE",
    };

    const jobType = jobTypeMap[source];
    let conn;

    try {
      conn = await db.getConnection();
      const [result] = await conn.query(
        `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, notes)
         VALUES (?, ?, ?, ?, 'PENDING', ?)`,
        [user.id, jobType, file.originalname, file.path, notes || null]
      );

      res.status(202).json({
        success: true,
        message: "Laporan diterima.",
        jobId: result.insertId,
      });
    } catch (err) {
      console.error("Error upload-sales-report:", err);
      res.status(500).json({ success: false, message: "Terjadi kesalahan server." });
    } finally {
      conn?.release();
    }
  }
);

/* =====================================================================
   3. BATCH UPLOAD (V6 JSON)
   ===================================================================== */

router.post("/batch-upload", canAccess("upload-picking-list"), async (req, res) => {
  try {
    const { body, user } = req;

    const result = await performPickingValidation({
      items: body.items,
      userId: user.id,
      source: body.source,
      originalFilename: body.filename,
      originalInvoiceId: body.originalInvoiceId || null,
      customerName: body.customerName || null,
      orderDate: body.orderDate || null,
    });

    res.json(result);
  } catch (error) {
    console.error("Error batch-upload:", error);
    res.status(500).json({
      message: error.message || "Gagal menyimpan data upload.",
    });
  }
});

/* =====================================================================
   4. PENDING ITEMS
   ===================================================================== */

router.get("/pending-items", async (_, res) => {
  res.setHeader("Cache-Control", "no-store");

  // [PATCH] Menggunakan suggested_location_id agar item baru tetap muncul
  const sql = `
    SELECT
      pli.id, pli.quantity, pli.status,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at,
      p.sku, p.name AS product_name,
      loc.code AS location_code,
      pli.picking_list_id,
      IFNULL(sl.quantity, 0) AS available_stock
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc ON pli.suggested_location_id = loc.id
    LEFT JOIN stock_locations sl ON pli.product_id = sl.product_id
      AND pli.suggested_location_id = sl.location_id
    WHERE pli.status = 'PENDING_VALIDATION'
      AND pl.is_active = 1
    ORDER BY loc.code ASC, p.sku ASC
  `;

  try {
    const [items] = await db.query(sql);
    res.json({ success: true, data: items });
  } catch (err) {
    console.error("Error pending-items:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data picking.",
      errorDetail: err.message,
    });
  }
});

/* =====================================================================
   5. HISTORY ITEMS
   ===================================================================== */

router.get("/history-items", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const limit = parseInt(req.query.limit) || 1000;

  // Fallback location: picked -> suggested
  const sql = `
    SELECT
      pli.id, pli.quantity, pli.status,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at,
      p.sku, p.name AS product_name,
      COALESCE(loc_picked.code, loc_suggested.code) AS location_code,
      pli.picking_list_id
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc_picked ON pli.picked_from_location_id = loc_picked.id
    LEFT JOIN locations loc_suggested ON pli.suggested_location_id = loc_suggested.id
    WHERE pli.status != 'PENDING_VALIDATION'
    ORDER BY pli.id DESC
    LIMIT ?
  `;

  try {
    const [items] = await db.query(sql, [limit]);
    res.json({ items, total: items.length });
  } catch (err) {
    console.error("Error history-items:", err);
    res.status(500).json({ message: "Gagal mengambil riwayat." });
  }
});

/* =====================================================================
   6. COMPLETE ITEMS
   ===================================================================== */

router.post("/complete-items", canAccess("confirm-picking-list"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const userId = req.user.id;
  const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds : req.body;

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ success: false, message: "Format data salah. Harus array ID." });
  }

  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let completed = 0;

    for (const id of itemIds) {
      // 1. Validasi & Lock Item
      const [update] = await conn.query(
        `UPDATE picking_list_items
         SET status = 'COMPLETED'
         WHERE id = ? AND status = 'PENDING_VALIDATION'`,
        [id]
      );

      if (update.affectedRows === 0) {
        const [[current]] = await conn.query(`SELECT status FROM picking_list_items WHERE id = ?`, [
          id,
        ]);
        throw new Error(
          `Gagal memproses item ID ${id}. Status saat ini '${
            current?.status || "TIDAK DITEMUKAN"
          }'.`
        );
      }

      completed++;

      // 2. Ambil data item (Termasuk Suggested Location)
      const [[item]] = await conn.query(
        `SELECT product_id, quantity, picked_from_location_id, suggested_location_id
         FROM picking_list_items WHERE id = ?`,
        [id]
      );

      // [PATCH] Tentukan lokasi final (Fallback ke Suggested jika Picked belum diset)
      const finalLocationId = item.picked_from_location_id || item.suggested_location_id;

      if (!finalLocationId) {
        throw new Error(`Item ID ${id} tidak memiliki lokasi stok (picked/suggested).`);
      }

      // Jika picked_from belum ada (kasus auto-assign), update sekarang
      if (!item.picked_from_location_id) {
        await conn.query("UPDATE picking_list_items SET picked_from_location_id = ? WHERE id = ?", [
          finalLocationId,
          id,
        ]);
      }

      // 3. Kurangi Stok Fisik
      const [stock] = await conn.query(
        `UPDATE stock_locations
         SET quantity = quantity - ?
         WHERE product_id = ? AND location_id = ? AND quantity >= ?`,
        [item.quantity, item.product_id, finalLocationId, item.quantity]
      );

      if (stock.affectedRows === 0) {
        throw new Error(
          `Stok fisik tidak mencukupi di lokasi ID ${finalLocationId} untuk produk ID ${item.product_id}.`
        );
      }

      // 4. Catat Log
      await conn.query(
        `INSERT INTO stock_movements
         (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes)
         VALUES (?, ?, ?, ?, 'SALE', ?, ?)`,
        [item.product_id, item.quantity, finalLocationId, null, userId, `Picking Item ID: ${id}`]
      );
    }

    // 5. Cek Header Completion
    const placeholders = itemIds.map(() => "?").join(",");
    const [headers] = await conn.query(
      `SELECT DISTINCT picking_list_id FROM picking_list_items WHERE id IN (${placeholders})`,
      itemIds
    );

    for (const { picking_list_id } of headers) {
      const [remaining] = await conn.query(
        `SELECT COUNT(*) as count FROM picking_list_items WHERE picking_list_id = ? AND status NOT IN ('COMPLETED', 'CANCELLED')`,
        [picking_list_id]
      );

      if (remaining[0].count === 0) {
        await conn.query(
          `UPDATE picking_lists SET status = 'COMPLETED', is_active = NULL, updated_at = NOW() WHERE id = ?`,
          [picking_list_id]
        );
      }
    }

    await conn.commit();
    cache.flushAll();

    res.json({
      success: true,
      message: `Berhasil menyelesaikan ${completed} item picking.`,
    });
  } catch (err) {
    await conn?.rollback();
    console.error("Error complete-items:", err.message);
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn?.release();
  }
});

/* =====================================================================
   7. CANCEL PICKING LIST
   ===================================================================== */

router.post("/cancel/:id", canAccess("void-picking-list"), async (req, res) => {
  try {
    const result = await cancelPickingListService(req.params.id, req.user.id, req.body.reason);

    res.json(result);
  } catch (err) {
    console.error("Error cancel picking:", err);
    res.status(500).json({
      message: err.message || "Gagal membatalkan transaksi.",
    });
  }
});

/* =====================================================================
   8. RETURNED ITEMS
   ===================================================================== */

router.get("/returned-items", async (_, res) => {
  res.setHeader("Cache-Control", "no-store");

  const sql = `
    SELECT
      pli.id, pli.quantity, pli.status,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at,
      p.sku, p.name AS product_name
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    JOIN products p ON pli.product_id = p.id
    WHERE pli.status = 'RETURNED'
    ORDER BY pl.id DESC
  `;

  try {
    const [items] = await db.query(sql);
    res.json({ success: true, data: items });
  } catch (err) {
    console.error("Error returned-items:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data retur.",
    });
  }
});

router.get("/:id", getPickingListDetails);

router.get("/debug-status", async (req, res) => {
  try {
    const [lists] = await db.query(
      "SELECT id, status, is_active FROM picking_lists ORDER BY id DESC LIMIT 5"
    );
    const [items] = await db.query(
      "SELECT id, picking_list_id, status FROM picking_list_items ORDER BY id DESC LIMIT 5"
    );

    res.json({
      message: "Database State Diagnosis",
      picking_lists: lists,
      picking_list_items: items,
      diagnosis: {
        lists_active: lists.filter((l) => l.is_active === 1).length,
        items_pending_val: items.filter((i) => i.status === "PENDING_VALIDATION").length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
