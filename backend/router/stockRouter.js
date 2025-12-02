// backend/router/stockRouter.js
import express from "express";
import db from "../config/db.js";
import cache from "../config/cache.js";
import { broadcastStockUpdate } from "./realtimeRouter.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getTimestampString_YYMMDDHHSS } from "../services/helpers/sharedHelpers.js";
import ExcelJS from "exceljs";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path: backend/uploads/adjustments/
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "adjustments");

// Pastikan direktori ada
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.error("Gagal membuat folder upload adjustment:", err);
  }
}

// Konfigurasi Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const originalName = path.parse(file.originalname).name; // "stock_opname"
    const timestamp = getTimestampString_YYMMDDHHSS(); // "251113160530"
    const ext = path.extname(file.originalname); // Ini sekarang akan .xlsx
    cb(null, `${originalName}_${timestamp}${ext}`); // "stock_opname_251113160530.xlsx"
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype;

    if (
      ext !== ".xlsx" ||
      mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return cb(new Error("Hanya file .xlsx yang diizinkan"), false);
    }
    cb(null, true);
  },
});

/**
 * POST /api/stock/transfer
 * Memindahkan sejumlah stok dari satu lokasi ke lokasi lain.
 */
router.post("/transfer", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { productId, fromLocationId, toLocationId, quantity } = req.body;
  const userId = req.user.id;

  if (!productId || !fromLocationId || !toLocationId || !quantity || parseInt(quantity) <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Input tidak lengkap atau kuantitas tidak valid." });
  }
  if (fromLocationId === toLocationId) {
    return res
      .status(400)
      .json({ success: false, message: "Lokasi asal dan tujuan tidak boleh sama." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [currentStockRows] = await connection.query(
      "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
      [productId, fromLocationId]
    );

    const currentStock = currentStockRows[0]?.quantity || 0;
    if (currentStock < quantity) {
      await connection.rollback();
      return res
        .status(400)
        .json({ success: false, message: `Stok tidak mencukupi. Stok saat ini: ${currentStock}` });
    }

    await connection.query(
      "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        productId,
        quantity,
        fromLocationId,
        toLocationId,
        "TRANSFER",
        userId,
        `Transfer from loc ${fromLocationId} to ${toLocationId}`,
      ]
    );

    await connection.query(
      "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
      [quantity, productId, fromLocationId]
    );

    await connection.query(
      "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
      [productId, toLocationId, quantity, quantity]
    );

    await connection.commit();
    cache.flushAll();

    const [updatedStock] = await db.query(
      `SELECT sl.product_id, l.code as location_code, sl.quantity
             FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
             WHERE sl.product_id = ?`,
      [productId]
    );
    broadcastStockUpdate([{ productId, newStock: updatedStock }]);

    res.status(200).json({ success: true, message: "Transfer stok berhasil." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat transfer stok:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/stock/adjust
 * Menyesuaikan (menambah atau mengurangi) stok di satu lokasi.
 */
router.post("/adjust", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { productId, locationId, quantity, notes } = req.body;
  const userId = req.user.id;

  if (!productId || !locationId || quantity === 0 || !notes) {
    return res.status(400).json({
      success: false,
      message: "Produk, lokasi, kuantitas (bukan nol), dan catatan wajib diisi.",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    if (quantity < 0) {
      const [currentStockRows] = await connection.query(
        "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
        [productId, locationId]
      );
      const currentStock = currentStockRows[0]?.quantity || 0;
      if (currentStock + quantity < 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Stok tidak mencukupi. Stok saat ini: ${currentStock}, ingin dikurangi: ${Math.abs(
            quantity
          )}.`,
        });
      }
    }

    await connection.query(
      "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, Math.abs(quantity), locationId, "ADJUSTMENT", userId, notes]
    );

    await connection.query(
      "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
      [productId, locationId, quantity, quantity]
    );

    await connection.commit();
    cache.flushAll();

    const [updatedStock] = await db.query(
      `SELECT sl.product_id, l.code as location_code, sl.quantity
             FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
             WHERE sl.product_id = ?`,
      [productId]
    );
    broadcastStockUpdate([{ productId, newStock: updatedStock }]);

    res.status(200).json({ success: true, message: "Penyesuaian stok berhasil." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat penyesuaian stok:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/stock/download-adjustment-template
 * Men-generasi file template Excel .xlsx untuk adjustment stok
 * dengan validasi data dropdown dari tabel 'locations'.
 */
router.get("/download-adjustment-template", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  let connection;

  try {
    connection = await db.getConnection();

    const [locations] = await connection.query("SELECT code FROM locations ORDER BY code ASC");
    const locationCodes = locations.map((loc) => loc.code);

    const workbook = new ExcelJS.Workbook();
    const mainSheet = workbook.addWorksheet("Input Stok");
    const validationSheet = workbook.addWorksheet("DataValidasi");

    validationSheet.state = "hidden";
    validationSheet.getColumn("A").values = locationCodes;

    mainSheet.columns = [
      { header: "SKU", key: "sku", width: 25 },
      { header: "LT (Lokasi)", key: "location", width: 20 },
      { header: "ACTUAL", key: "actual", width: 10 },
      { header: "NOTES", key: "notes", width: 35 },
    ];
    mainSheet.getRow(1).font = { bold: true };

    const validationFormula = `DataValidasi!$A$1:$A$${locationCodes.length}`;

    for (let i = 2; i <= 1002; i++) {
      mainSheet.getCell(`B${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [validationFormula],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Lokasi Tidak Valid",
        error: "Silakan pilih lokasi yang valid dari daftar dropdown.",
      };
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=Template_Adjustment_Stok.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error saat generate template adjustment:", error);
    res.status(500).json({ success: false, message: "Gagal membuat template." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/stock/request-adjustment-upload
 * Menerima file .xlsx (sebelumnya .csv) untuk penyesuaian stok massal.
 */
router.post("/request-adjustment-upload", upload.single("adjustmentFile"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user.id;
  const file = req.file;
  const { notes } = req.body;

  if (!file) {
    return res.status(400).json({
      success: false,
      message:
        "File tidak ditemukan. Pastikan field name adalah 'adjustmentFile' dan tipenya .xlsx",
    });
  }

  let connection;
  try {
    const { originalname, path: serverFilePath } = file;

    connection = await db.getConnection();

    const [result] = await connection.query(
      `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, notes)
         VALUES (?, 'ADJUST_STOCK', ?, ?, 'PENDING', ?)`,
      [userId, originalname, serverFilePath, notes || null]
    );

    res.status(202).json({
      success: true,
      message: "File diterima. Penyesuaian stok akan diproses di latar belakang.",
      jobId: result.insertId,
    });
  } catch (error) {
    console.error("Error saat request stock adjustment upload:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server saat membuat job.",
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/stock/import-jobs
 * Mengambil riwayat pekerjaan impor untuk pengguna yang sedang login.
 */
router.get("/import-jobs", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const userId = req.user.id;
    // [CRITICAL FIX]: Menambahkan kolom 'error_log' agar frontend bisa membaca download_url
    const [jobs] = await db.query(
      `SELECT id, status, job_type, original_filename, log_summary, error_log, created_at, notes
        FROM import_jobs
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );
    res.status(200).json({ success: true, data: jobs });
  } catch (error) {
    console.error("Error saat getUserImportJobs:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat pekerjaan." });
  }
});

/**
 * POST /api/stock/import-jobs/:id/cancel
 * Membatalkan job import yang masih dalam antrian (PENDING).
 */
router.post("/import-jobs/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [result] = await db.query(
      "UPDATE import_jobs SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING' AND user_id = ?",
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: "Gagal membatalkan. Job mungkin sudah diproses atau bukan milik Anda.",
      });
    }

    res.json({ success: true, message: "Antrian berhasil dibatalkan." });
  } catch (error) {
    console.error("Error cancelling job:", error);
    res.status(500).json({ success: false, message: "Gagal membatalkan job." });
  }
});

/**
 * POST /api/stock/batch-process
 * Memproses batch pergerakan stok (TRANSFER, INBOUND, RETURN, ADJUSTMENT, TRANSFER_MULTI).
 */
router.post("/batch-process", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { type, fromLocationId, toLocationId, notes, movements } = req.body;
  const userId = req.user.id;
  const userRoleId = req.user.role_id;

  if (!type || !Array.isArray(movements) || movements.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Tipe pergerakan dan daftar item wajib diisi." });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Keamanan RBAC
    if (type === "TRANSFER" || type === "ADJUSTMENT") {
      if (userRoleId !== 1) {
        const locationToCheck = type === "TRANSFER" ? fromLocationId : toLocationId;
        if (!locationToCheck) {
          throw new Error("Lokasi (asal atau tujuan) wajib diisi untuk operasi ini.");
        }

        const [permissionRows] = await connection.query(
          "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
          [userId, locationToCheck]
        );
        if (permissionRows.length === 0) {
          throw new Error("Akses ditolak. Anda tidak memiliki izin untuk lokasi ini.");
        }
      }
    }

    const updatedProductIds = new Set();

    for (const movement of movements) {
      const { sku, quantity } = movement;
      const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      if (productRows.length === 0) throw new Error(`SKU '${sku}' tidak ditemukan.`);

      const productId = productRows[0].id;
      updatedProductIds.add(productId);

      switch (type) {
        case "TRANSFER":
          if (!fromLocationId || !toLocationId)
            throw new Error("Lokasi asal dan tujuan wajib diisi untuk transfer.");
          await connection.query(
            "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
            [quantity, productId, fromLocationId]
          );
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, toLocationId, quantity, quantity]
          );
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [productId, quantity, fromLocationId, toLocationId, "TRANSFER", userId, notes]
          );
          break;

        case "TRANSFER_MULTI":
          const { fromLocationId: itemFromLocId, toLocationId: itemToLocId } = movement;

          if (!itemFromLocId || !itemToLocId) {
            throw new Error(
              `SKU '${sku}' tidak memiliki lokasi asal atau tujuan di dalam payload.`
            );
          }

          if (userRoleId !== 1) {
            const [permissionRows] = await connection.query(
              "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
              [userId, itemFromLocId]
            );
            if (permissionRows.length === 0) {
              throw new Error(`Akses ditolak. Anda tidak punya izin untuk lokasi SKU '${sku}'.`);
            }
          }

          await connection.query(
            "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
            [quantity, productId, itemFromLocId]
          );
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, itemToLocId, quantity, quantity]
          );
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [productId, quantity, itemFromLocId, itemToLocId, "TRANSFER", userId, notes]
          );
          break;

        case "INBOUND":
        case "RETURN":
          if (!toLocationId) throw new Error("Lokasi tujuan wajib diisi untuk inbound/return.");
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, toLocationId, quantity, quantity]
          );
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, NULL, ?, ?, ?, ?)",
            [productId, quantity, toLocationId, type, userId, notes]
          );
          break;

        case "ADJUSTMENT":
          if (!toLocationId || !notes)
            throw new Error("Lokasi dan catatan wajib diisi untuk penyesuaian.");
          await connection.query(
            "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
            [productId, toLocationId, quantity, quantity]
          );
          await connection.query(
            "INSERT INTO stock_movements (product_id, quantity, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?)",
            [productId, Math.abs(quantity), toLocationId, "ADJUSTMENT", userId, notes]
          );
          break;

        default:
          throw new Error(`Tipe pergerakan '${type}' tidak dikenal.`);
      }
    }

    await connection.commit();
    cache.flushAll();

    const finalUpdates = [];
    for (const productId of updatedProductIds) {
      const [updatedStock] = await db.query(
        `SELECT sl.product_id, l.code as location_code, sl.quantity
         FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
         WHERE sl.product_id = ?`,
        [productId]
      );
      finalUpdates.push({ productId, newStock: updatedStock });
    }
    broadcastStockUpdate(finalUpdates);

    res
      .status(200)
      .json({ success: true, message: `Batch ${type} untuk ${movements.length} item berhasil.` });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`Error saat proses batch ${type}:`, error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/stock/history/:productId
 * Mengambil riwayat pergerakan stok untuk satu produk.
 */
router.get("/history/:productId", async (req, res) => {
  const { productId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 15;
  const offset = (page - 1) * limit;

  try {
    const countQuery = "SELECT COUNT(*) as total FROM stock_movements WHERE product_id = ?";
    const [totalRows] = await db.query(countQuery, [productId]);
    const total = totalRows[0].total;

    const historyQuery = `
            SELECT
                sm.id, sm.quantity, sm.movement_type, sm.notes, sm.created_at,
                u.username as user,
                from_loc.code as from_location,
                to_loc.code as to_location
            FROM stock_movements sm
            JOIN users u ON sm.user_id = u.id
            LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
            LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
            WHERE sm.product_id = ?
            ORDER BY sm.created_at DESC
            LIMIT ? OFFSET ?
        `;
    const [history] = await db.query(historyQuery, [productId, limit, offset]);

    res.json({
      success: true,
      data: history,
      pagination: { total, page, limit },
    });
  } catch (error) {
    console.error(`Error saat mengambil riwayat stok untuk produk ID ${productId}:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat stok." });
  }
});

/**
 * POST /api/stock/batch-transfer
 * Memindahkan stok untuk beberapa produk sekaligus dari satu lokasi ke lokasi lain.
 */
router.post("/batch-transfer", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { fromLocationId, toLocationId, movements } = req.body;
  const userId = req.user.id;
  const userRoleId = req.user.role_id; // Ambil role_id dari token

  if (!fromLocationId || !toLocationId || !Array.isArray(movements) || movements.length === 0) {
    return res.status(400).json({ success: false, message: "Input tidak valid." });
  }

  let connection;
  try {
    connection = await db.getConnection();

    if (userRoleId !== 1) {
      const [permissionRows] = await connection.query(
        "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?",
        [userId, fromLocationId]
      );
      if (permissionRows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak. Anda tidak memiliki izin untuk lokasi asal ini.",
        });
      }
    }

    await connection.beginTransaction();
    const updatedProductIds = new Set();

    for (const movement of movements) {
      const { sku, quantity } = movement;
      const [productRows] = await connection.query("SELECT id FROM products WHERE sku = ?", [sku]);
      if (productRows.length === 0) {
        throw new Error(`SKU '${sku}' tidak ditemukan.`);
      }
      const productId = productRows[0].id;
      updatedProductIds.add(productId);

      const [stockRows] = await connection.query(
        "SELECT quantity FROM stock_locations WHERE product_id = ? AND location_id = ? FOR UPDATE",
        [productId, fromLocationId]
      );
      const currentStock = stockRows[0]?.quantity || 0;
      if (currentStock < quantity) {
        throw new Error(
          `Stok untuk SKU '${sku}' tidak mencukupi (stok: ${currentStock}, butuh: ${quantity}).`
        );
      }

      await connection.query(
        "UPDATE stock_locations SET quantity = quantity - ? WHERE product_id = ? AND location_id = ?",
        [quantity, productId, fromLocationId]
      );
      await connection.query(
        "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
        [productId, toLocationId, quantity, quantity]
      );
      await connection.query(
        "INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [productId, quantity, fromLocationId, toLocationId, "TRANSFER", userId, `Batch transfer`]
      );
    }

    await connection.commit();
    cache.flushAll();

    const finalUpdates = [];
    for (const productId of updatedProductIds) {
      const [updatedStock] = await db.query(
        `SELECT sl.product_id, l.code as location_code, sl.quantity
          FROM stock_locations sl JOIN locations l ON sl.location_id = l.id
          WHERE sl.product_id = ?`,
        [productId]
      );
      finalUpdates.push({ productId, newStock: updatedStock });
    }
    broadcastStockUpdate(finalUpdates);

    res
      .status(200)
      .json({ success: true, message: `Batch transfer untuk ${movements.length} item berhasil.` });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat batch transfer stok:", error.message);
    res
      .status(400)
      .json({ success: false, message: error.message || "Terjadi kesalahan pada server." });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/stock/batch-log
 * Mengambil semua log pergerakan stok dalam rentang tanggal tertentu.
 */
router.get("/batch-log", async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ success: false, message: "Tanggal mulai dan tanggal selesai wajib diisi." });
  }

  try {
    const query = `
      SELECT
        sm.id,
        p.sku,
        p.name as product_name,
        sm.quantity,
        sm.movement_type,
        sm.notes,
        sm.created_at,
        u.username as user,
        from_loc.code as from_location,
        to_loc.code as to_location
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      JOIN users u ON sm.user_id = u.id
      LEFT JOIN locations from_loc ON sm.from_location_id = from_loc.id
      LEFT JOIN locations to_loc ON sm.to_location_id = to_loc.id
      WHERE sm.created_at BETWEEN ? AND ?
      ORDER BY sm.created_at DESC;
    `;
    const [logs] = await db.query(query, [startDate, `${endDate} 23:59:59`]);

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error(`Error saat mengambil log batch:`, error);
    res.status(500).json({ success: false, message: "Gagal mengambil log batch." });
  }
});

/**
 * POST /api/stock/validate-return
 */
router.post("/validate-return", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { pickingListItemId, returnToLocationId } = req.body;
  const userId = req.user.id;

  if (!pickingListItemId || !returnToLocationId) {
    return res.status(400).json({
      success: false,
      message: "pickingListItemId dan returnToLocationId wajib diisi.",
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [itemRows] = await connection.query(
      `SELECT product_id, quantity
       FROM picking_list_items
       WHERE id = ? AND status = 'RETURNED'
       FOR UPDATE`,
      [pickingListItemId]
    );

    if (itemRows.length === 0) {
      throw new Error("Item retur tidak ditemukan atau sudah divalidasi/dibatalkan.");
    }

    const itemToReturn = itemRows[0];
    const { product_id, quantity } = itemToReturn;

    await connection.query(
      "INSERT INTO stock_locations (product_id, location_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?",
      [product_id, returnToLocationId, quantity, quantity]
    );

    await connection.query(
      `INSERT INTO stock_movements (product_id, quantity, from_location_id, to_location_id, movement_type, user_id, notes)
       VALUES (?, ?, ?, ?, 'RETURN', ?, ?)`,
      [
        product_id,
        quantity,
        null,
        returnToLocationId,
        userId,
        `Validasi Retur Item ID: ${pickingListItemId}`,
      ]
    );

    await connection.query(
      "UPDATE picking_list_items SET status = 'COMPLETED_RETURN' WHERE id = ?",
      [pickingListItemId]
    );

    await connection.commit();
    cache.flushAll();

    res.status(200).json({
      success: true,
      message: `Item (ID: ${pickingListItemId}) berhasil divalidasi dan stok dikembalikan.`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saat /validate-return:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    if (connection) connection.release();
  }
});

export default router;
