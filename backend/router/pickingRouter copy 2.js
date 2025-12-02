// backend/router/pickingRouter.js
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// Utils & Middleware
import db from "../config/db.js";
import cache from "../config/cache.js";
import { ParserEngine } from "../services/ParserEngine.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { canAccess } from "../middleware/permissionMiddleware.js";
import { getTimestampString_YYMMDDHHSS } from "../services/helpers/sharedHelpers.js";
import { getPickingListDetails } from "../controllers/pickingController.js";
import { performPickingValidation } from "../services/pickingDataService.js";

const router = express.Router();
router.use(authMiddleware);

/* =====================================================================
    KONFIGURASI UPLOAD
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

// Helper untuk insert Log Job
const createImportJobLog = async (userId, filename, jobType, status = "PENDING") => {
  try {
    const [res] = await db.query(
      `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, NOW(), NOW())`,
      [userId, jobType, filename, status]
    );
    return res.insertId;
  } catch (e) {
    console.error("Gagal catat log import_jobs:", e);
    return null;
  }
};

const updateImportJobLog = async (jobId, status, summary) => {
  if (!jobId) return;
  try {
    await db.query(
      `UPDATE import_jobs SET status = ?, log_summary = ?, updated_at = NOW() WHERE id = ?`,
      [status, summary, jobId]
    );
  } catch (e) {
    console.error("Gagal update log import_jobs:", e);
  }
};

/* =====================================================================
    ROUTES
   ===================================================================== */

// Upload Legacy
router.post(
  "/upload-sales-report",
  canAccess("upload-picking-list"),
  uploadSales.single("salesReportFile"),
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { file, body, user } = req;
    const { notes, source } = body;
    console.log("[PickingRouter] Upload Sales Report:", {
      file: file?.originalname,
      source,
      userId: user.id,
    });
    if (!file) return res.status(400).json({ success: false, message: "File tidak ditemukan." });

    // Simple insert to import_jobs
    try {
      const jobType =
        source === "Offline" ? "IMPORT_SALES_OFFLINE" : `IMPORT_SALES_${source.toUpperCase()}`;
      const [result] = await db.query(
        `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, notes)
         VALUES (?, ?, ?, ?, 'PENDING', ?)`,
        [user.id, jobType, file.originalname, file.path, notes || null]
      );
      res.status(202).json({ success: true, message: "Laporan diterima.", jobId: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

// Batch Upload (V6) - [WITH DEBUG LOGGING]
router.post("/batch-upload", canAccess("upload-picking-list"), async (req, res) => {
  try {
    const { body, user } = req;
    console.log("-------------------------------------------------");
    console.log("Source       :", body.source);
    console.log("Filename     :", body.filename);
    console.log("Items Count  :", Array.isArray(body.items) ? body.items.length : 0);
    console.log("👉 ORDER DATE :", body.orderDate || "❌ N/A (NULL)");
    console.log("Invoice ID   :", body.originalInvoiceId || "N/A");
    console.log("-------------------------------------------------\n");

    const result = await performPickingValidation({
      items: body.items,
      userId: user.id,
      source: body.source,
      originalFilename: body.filename,
      originalInvoiceId: body.originalInvoiceId || null,
      customerName: body.customerName || null,
      orderDate: body.orderDate || null,
    });
    console.log("\n[Batch Upload Result]:", result);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || "Gagal upload." });
  }
});

// Pending Items (SMART READ)
router.get("/pending-items", async (_, res) => {
  res.setHeader("Cache-Control", "no-store");

  const sql = `
    SELECT
      pli.id, pli.quantity, pli.status,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at,
      p.sku, p.name AS product_name,
      pli.picking_list_id,

      COALESCE(loc.code, (
        SELECT l2.code
        FROM stock_locations sl2
        JOIN locations l2 ON sl2.location_id = l2.id
        WHERE sl2.product_id = pli.product_id
          AND l2.purpose = 'DISPLAY'
          AND sl2.quantity > 0
        ORDER BY sl2.quantity DESC LIMIT 1
      )) AS location_code,

      COALESCE(sl.quantity, (
        SELECT sl2.quantity
        FROM stock_locations sl2
        JOIN locations l2 ON sl2.location_id = l2.id
        WHERE sl2.product_id = pli.product_id
          AND l2.purpose = 'DISPLAY'
          AND sl2.quantity > 0
        ORDER BY sl2.quantity DESC LIMIT 1
      ), 0) AS available_stock

    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc ON pli.suggested_location_id = loc.id
    LEFT JOIN stock_locations sl ON pli.product_id = sl.product_id
      AND pli.suggested_location_id = sl.location_id
    WHERE pli.status = 'PENDING_VALIDATION'
      AND (pl.is_active = 1 OR pl.is_active IS NULL)
    ORDER BY location_code ASC, p.sku ASC
  `;

  try {
    const [items] = await db.query(sql);
    res.json({ success: true, data: items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal ambil data." });
  }
});

// History Items
router.get("/history-items", async (req, res) => {
  const limit = parseInt(req.query.limit) || 1000;
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
    res.status(500).json({ message: "Gagal ambil riwayat." });
  }
});

// Complete Items (SMART COMPLETE)
router.post("/complete-items", canAccess("confirm-picking-list"), async (req, res) => {
  const userId = req.user.id;
  const itemIds = req.body.itemIds;
  if (!Array.isArray(itemIds) || !itemIds.length)
    return res.status(400).json({ message: "Invalid data" });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let completed = 0;
    for (const id of itemIds) {
      const [upd] = await conn.query(
        "UPDATE picking_list_items SET status = 'COMPLETED' WHERE id = ? AND status = 'PENDING_VALIDATION'",
        [id]
      );
      if (upd.affectedRows === 0) continue;
      completed++;

      const [[item]] = await conn.query(
        "SELECT product_id, quantity, picked_from_location_id, suggested_location_id FROM picking_list_items WHERE id = ?",
        [id]
      );

      let locId = item.picked_from_location_id || item.suggested_location_id;

      if (!locId) {
        const [[fallbackLoc]] = await conn.query(
          `SELECT sl.location_id FROM stock_locations sl
           JOIN locations l ON sl.location_id = l.id
           WHERE sl.product_id = ? AND l.purpose = 'DISPLAY' AND sl.quantity >= ?
           ORDER BY sl.quantity DESC LIMIT 1`,
          [item.product_id, item.quantity]
        );
        if (fallbackLoc) locId = fallbackLoc.location_id;
      }

      if (!locId)
        throw new Error(
          `Item ${id} (Produk ID ${item.product_id}) stok tidak ditemukan di lokasi DISPLAY manapun.`
        );

      await conn.query("UPDATE picking_list_items SET picked_from_location_id = ? WHERE id = ?", [
        locId,
        id,
      ]);

      const [stock] = await conn.query(
        "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ? AND quantity >= ?",
        [item.quantity, item.product_id, locId, item.quantity]
      );
      if (stock.affectedRows === 0)
        throw new Error(`Stok tidak cukup (butuh ${item.quantity}) di lokasi ID ${locId}`);

      await conn.query(
        "INSERT INTO stock_movements (product_id, quantity, from_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, 'SALE', ?, ?)",
        [item.product_id, item.quantity, locId, userId, `Picking Item: ${id}`]
      );
    }

    const placeholders = itemIds.map(() => "?").join(",");
    const [headers] = await conn.query(
      `SELECT DISTINCT picking_list_id FROM picking_list_items WHERE id IN (${placeholders})`,
      itemIds
    );

    for (const h of headers) {
      const [[rem]] = await conn.query(
        "SELECT COUNT(*) as c FROM picking_list_items WHERE picking_list_id = ? AND status != 'COMPLETED' AND status != 'CANCELLED'",
        [h.picking_list_id]
      );
      if (rem.c === 0) {
        await conn.query(
          "UPDATE picking_lists SET status = 'COMPLETED', is_active = NULL WHERE id = ?",
          [h.picking_list_id]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: `${completed} item selesai.` });
  } catch (err) {
    if (conn) await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Cancel Picking
router.post("/cancel/:id", canAccess("void-picking-list"), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query("SELECT status FROM picking_lists WHERE id = ? FOR UPDATE", [
      id,
    ]);
    if (!rows.length) throw new Error("Not found");

    await conn.query(
      "UPDATE picking_lists SET status = 'CANCELLED', is_active = NULL WHERE id = ?",
      [id]
    );
    await conn.query(
      "UPDATE picking_list_items SET status = 'CANCELLED' WHERE picking_list_id = ?",
      [id]
    );

    await conn.query(
      "INSERT INTO audit_logs (user_id, action_type, target_table, target_id, details) VALUES (?, 'CANCEL_PICKING', 'picking_lists', ?, 'User Cancel')",
      [userId, id]
    );

    await conn.commit();
    res.json({ success: true, message: "Dibatalkan." });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Returned Items
router.get("/returned-items", async (_, res) => {
  try {
    const [items] = await db.query(`
      SELECT pli.*, p.sku, p.name as product_name, pl.original_invoice_id
      FROM picking_list_items pli
      JOIN picking_lists pl ON pli.picking_list_id = pl.id
      JOIN products p ON pli.product_id = p.id
      WHERE pli.status = 'RETURNED' ORDER BY pli.id DESC
    `);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ message: "Error." });
  }
});

// =====================================================================
// SMART UPLOAD (Upload -> Parse -> Validate)
// =====================================================================
router.post(
  "/upload-and-validate",
  canAccess("upload-picking-list"),
  uploadSales.array("files", 20),
  async (req, res) => {
    try {
      const { files, body, user } = req;
      if (!files || files.length === 0) throw new Error("Tidak ada file.");

      const source = body.source || "Tokopedia";
      const summary = {
        totalFiles: files.length,
        processedFiles: 0,
        totalItemsValid: 0,
        errors: [],
      };

      // [UPDATE] Buat Job Type string
      const jobType = `IMPORT_SALES_${source.toUpperCase()}`;

      for (const file of files) {
        // 1. [NEW] CATAT KE DB (History Awal)
        const jobId = await createImportJobLog(user.id, file.originalname, jobType, "PROCESSING");

        try {
          // 2. Parse
          const parser = new ParserEngine(file.path, source);
          const parseResult = await parser.run();

          // 3. Flatten Items
          let flatItems = [];
          parseResult.orders.forEach((orderData, invoiceId) => {
            orderData.items.forEach((item) => {
              flatItems.push({
                invoiceId: invoiceId,
                customer: orderData.recipient,
                sku: item.sku,
                qty: item.qty,
                status: item.status,
                row: item.row,
              });
            });
          });

          // 4. Validate & Insert (Logic Baru Multi-Invoice)
          let fileMsg = "";
          let finalStatus = "COMPLETED";

          if (flatItems.length > 0) {
            const validationResult = await performPickingValidation({
              items: flatItems,
              userId: user.id,
              source: source,
              originalFilename: file.originalname,
            });

            summary.totalItemsValid += validationResult.validItems.length;

            // Siapkan pesan sukses untuk log
            fileMsg = `${validationResult.processedInvoices} Invoice, ${validationResult.validItems.length} Item Valid.`;

            if (validationResult.invalidSkus.length > 0) {
              finalStatus = "COMPLETED_WITH_ERRORS";
              fileMsg += ` (${validationResult.invalidSkus.length} SKU Bermasalah)`;
              summary.errors.push({
                file: file.originalname,
                issues: validationResult.invalidSkus,
              });
            }
          } else {
            fileMsg = "File kosong atau tidak ada item valid.";
            finalStatus = "FAILED";
          }

          // 5. [NEW] UPDATE DB (History Akhir)
          await updateImportJobLog(jobId, finalStatus, fileMsg);

          summary.processedFiles++;
        } catch (err) {
          console.error(`Error processing file ${file.originalname}:`, err);
          summary.errors.push({ file: file.originalname, message: err.message });
          // Update status FAILED
          await updateImportJobLog(jobId, "FAILED", err.message);
        }
      }

      res.json({
        success: true,
        message: `Selesai. ${summary.processedFiles} file diproses.`,
        data: summary,
      });
    } catch (error) {
      console.error("[Batch Upload Error]", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Details
router.get("/:id", getPickingListDetails);

export default router;
