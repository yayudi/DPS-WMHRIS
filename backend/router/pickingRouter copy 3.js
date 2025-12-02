import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";

// Utils & Middleware
import db from "../config/db.js";
import { canAccess } from "../middleware/permissionMiddleware.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { getTimestampString_YYMMDDHHSS } from "../services/helpers/sharedHelpers.js";

// V6 services
import { performPickingValidation } from "../services/pickingDataService.js";
import { ParserEngine } from "../services/ParserEngine.js";
import { getPickingListDetails } from "../controllers/pickingController.js";

const router = express.Router();
router.use(authMiddleware);

/* =====================================================================
   1. KONFIGURASI UPLOAD & HELPER LOGGING
   ===================================================================== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Direktori Upload Utama
const UPLOAD_DIR_SALES = path.join(__dirname, "..", "uploads", "sales_reports");
// Direktori Laporan Error
const UPLOAD_DIR_ERRORS = path.join(__dirname, "..", "uploads", "error_reports");

[UPLOAD_DIR_SALES, UPLOAD_DIR_ERRORS].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const valid = [".csv", ".xlsx", ".xls"];
    if (valid.includes(ext)) return cb(null, true);
    cb(new Error("Hanya file .csv atau .xlsx yang diizinkan"), false);
  },
});

// --- HELPER LOGGING DB ---

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

const updateImportJobLog = async (jobId, status, summaryText, errorLogObj = null) => {
  if (!jobId) return;
  try {
    const errorLogStr = errorLogObj ? JSON.stringify(errorLogObj) : null;
    await db.query(
      `UPDATE import_jobs SET status = ?, log_summary = ?, error_log = ?, updated_at = NOW() WHERE id = ?`,
      [status, summaryText, errorLogStr, jobId]
    );
  } catch (e) {
    console.error("Gagal update log import_jobs:", e);
  }
};

// --- [FIX] ROBUST EXCELJS INSTANTIATION ---
const getWorkbookClass = () => {
  if (ExcelJS && ExcelJS.default && typeof ExcelJS.default.Workbook === "function") {
    return ExcelJS.default.Workbook;
  }
  if (ExcelJS && typeof ExcelJS.Workbook === "function") {
    return ExcelJS.Workbook;
  }
  console.error("[ExcelJS Debug] ExcelJS content:", ExcelJS);
  throw new Error("Gagal memuat library ExcelJS. Struktur module tidak dikenali.");
};

// --- [NEW] DEFINISI HEADER SESUAI FORMAT ASLI MARKETPLACE ---
// Ini memetakan data internal kita (key) ke Header Asli Marketplace (header)
// Agar file hasil download bisa langsung di-upload ulang.
const SOURCE_HEADERS = {
  Tokopedia: [
    { header: "Order ID", key: "invoiceId", width: 25 },
    { header: "Recipient", key: "customer", width: 25 },
    { header: "Seller SKU", key: "sku", width: 25 }, // Kunci Parsing Tokopedia
    { header: "Quantity", key: "qty", width: 10 },
    { header: "Product Name", key: "productName", width: 40 }, // Opsional untuk konteks
    { header: ">> ALASAN ERROR <<", key: "message", width: 50 }, // Kolom Error
  ],
  Shopee: [
    { header: "No. Pesanan", key: "invoiceId", width: 25 },
    { header: "Nama Penerima", key: "customer", width: 25 },
    { header: "Nomor Referensi SKU", key: "sku", width: 25 }, // Kunci Parsing Shopee
    { header: "Jumlah", key: "qty", width: 10 },
    { header: "Nama Produk", key: "productName", width: 40 },
    { header: ">> ALASAN ERROR <<", key: "message", width: 50 },
  ],
  Offline: [
    { header: "*Nomor Tagihan", key: "invoiceId", width: 25 },
    { header: "*Nama Kontak", key: "customer", width: 25 },
    { header: "*Kode Produk (SKU)", key: "sku", width: 25 }, // Kunci Parsing Offline
    { header: "*Jumlah Produk", key: "qty", width: 10 },
    { header: "*Nama Produk", key: "productName", width: 40 },
    { header: ">> ALASAN ERROR <<", key: "message", width: 50 },
  ],
};

// [UPDATE] Generator Excel "Repair File"
const generateErrorExcel = async (originalFilename, failedItems, source) => {
  try {
    const WorkbookClass = getWorkbookClass();
    const workbook = new WorkbookClass();
    const sheet = workbook.addWorksheet("DATA PERBAIKAN");

    // 1. Tentukan Header berdasarkan Source
    // Jika source tidak dikenali, gunakan default (Tokopedia style)
    const columnsConfig = SOURCE_HEADERS[source] || SOURCE_HEADERS["Tokopedia"];
    sheet.columns = columnsConfig;

    // 2. Styling Header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C3E50" } }; // Dark Blue
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Khusus Kolom Error (Kolom Terakhir) kasih warna Merah di Headernya
    const lastColIdx = columnsConfig.length;
    headerRow.getCell(lastColIdx).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDC3545" },
    }; // Red

    // 3. Isi Data
    failedItems.forEach((item) => {
      // Mapping data internal ke key yang diharapkan ExcelJS
      const rowData = {
        invoiceId: item.invoiceId || "UNKNOWN",
        customer: item.customer || "",
        sku: item.sku || "",
        qty: item.qty || 0,
        // Nama produk dummy jika tidak ada, agar format terlihat "penuh"
        productName: item.productName || "(Perbaiki SKU)",
        message: item.message || "Error tidak diketahui",
      };

      const row = sheet.addRow(rowData);

      // Highlight pesan error dengan warna merah bold
      row.getCell("message").font = { color: { argb: "FFDC3545" }, bold: true };
    });

    const timestamp = getTimestampString_YYMMDDHHSS();
    const safeName = path.parse(originalFilename).name.replace(/[^a-z0-9]/gi, "_");
    const filename = `REPAIR_${source}_${safeName}_${timestamp}.xlsx`;
    const absolutePath = path.join(UPLOAD_DIR_ERRORS, filename);

    await workbook.xlsx.writeFile(absolutePath);

    return `/uploads/error_reports/${filename}`;
  } catch (e) {
    console.error("Gagal generate excel error:", e);
    return null;
  }
};

/* =====================================================================
   ROUTES
   ===================================================================== */

// 1. LEGACY UPLOAD (Kompatibilitas)
router.post(
  "/upload-sales-report",
  canAccess("upload-picking-list"),
  uploadSales.single("salesReportFile"),
  async (req, res) => {
    res.status(501).json({ message: "Gunakan endpoint V6 /upload-and-validate" });
  }
);

// 2. NEW SMART UPLOAD
router.post(
  "/upload-and-validate",
  canAccess("upload-picking-list"),
  uploadSales.array("files", 20),
  async (req, res) => {
    try {
      const { files, body, user } = req;
      if (!files || files.length === 0) throw new Error("Tidak ada file yang diunggah.");

      const source = body.source || "Tokopedia";
      const batchSummary = {
        totalFiles: files.length,
        processedFiles: 0,
        totalItemsValid: 0,
        errors: [],
      };
      const jobType = `IMPORT_SALES_${source.toUpperCase()}`;

      for (const file of files) {
        const jobId = await createImportJobLog(user.id, file.originalname, jobType, "PROCESSING");

        let failedItemsForExcel = [];
        let uiErrors = [];

        try {
          // [FIX] Validasi Import ParserEngine
          let ParserClass = ParserEngine;
          if (ParserEngine && ParserEngine.default) ParserClass = ParserEngine.default;
          if (typeof ParserClass !== "function")
            throw new Error(`Internal Error: ParserEngine missing.`);

          // A. PARSE FILE
          const parser = new ParserClass(file.path, source);
          const parseResult = await parser.run();

          // B. FLATTEN
          let flatItems = [];
          if (parseResult.orders) {
            parseResult.orders.forEach((orderData, invoiceId) => {
              if (orderData.items) {
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
              }
            });
          }

          // Error Parsing (Langsung masuk list gagal)
          if (parseResult.auditLog && parseResult.auditLog.length > 0) {
            parseResult.auditLog.forEach((log) => {
              failedItemsForExcel.push({
                invoiceId: "PARSING_ERROR",
                customer: "-",
                sku: "ROW " + (log.row || "?"),
                qty: 0,
                message: log.message,
              });
              uiErrors.push({ row: log.row, sku: "PARSING", message: log.message });
            });
          }

          // C. VALIDATE
          let fileMsg = "";
          let finalStatus = "COMPLETED";

          if (flatItems.length > 0) {
            const validationResult = await performPickingValidation({
              items: flatItems,
              userId: user.id,
              source: source,
              originalFilename: file.originalname,
            });

            batchSummary.totalItemsValid += validationResult.validItems.length;
            fileMsg = `${validationResult.processedInvoices} Invoice, ${validationResult.validItems.length} Item Valid.`;

            if (validationResult.invalidSkus.length > 0) {
              finalStatus = "COMPLETED_WITH_ERRORS";
              fileMsg += ` (${validationResult.invalidSkus.length} Item Gagal)`;

              validationResult.invalidSkus.forEach((msg) => {
                // Ekstrak Invoice ID dari pesan error "[INV-123] Bla bla"
                const match = msg.match(/^\[(.*?)\] (.*)/);
                let invId = match ? match[1] : null;
                let cleanMsg = match ? match[2] : msg;

                // Cari data asli
                const originalItem =
                  flatItems.find((i) => i.invoiceId === invId && cleanMsg.includes(i.sku)) ||
                  flatItems.find((i) => i.invoiceId === invId) ||
                  {};

                failedItemsForExcel.push({
                  invoiceId: invId || originalItem.invoiceId || "UNKNOWN",
                  customer: originalItem.customer || "",
                  sku: originalItem.sku || "UNKNOWN",
                  qty: originalItem.qty || 0,
                  message: cleanMsg,
                });

                uiErrors.push({ row: "-", sku: originalItem.sku || invId, message: cleanMsg });
              });
            }
          } else {
            if (failedItemsForExcel.length === 0) {
              fileMsg = "File kosong / tidak ada data valid.";
              finalStatus = "FAILED";
              failedItemsForExcel.push({ message: "File tidak berisi data pesanan." });
            } else {
              fileMsg = "Gagal membaca file.";
              finalStatus = "FAILED";
            }
          }

          // D. GENERATE EXCEL & UPDATE LOG
          let errorPayload = null;

          if (failedItemsForExcel.length > 0) {
            // [UPDATE] Kirim parameter 'source' agar header Excel sesuai
            const downloadUrl = await generateErrorExcel(
              file.originalname,
              failedItemsForExcel,
              source
            );

            errorPayload = {
              errors: uiErrors,
              download_url: downloadUrl,
            };
            batchSummary.errors.push({
              file: file.originalname,
              count: failedItemsForExcel.length,
            });
          }

          await updateImportJobLog(jobId, finalStatus, fileMsg, errorPayload);
          batchSummary.processedFiles++;
        } catch (err) {
          console.error(`Error processing file ${file.originalname}:`, err);

          // Fatal Error handling
          const downloadUrl = await generateErrorExcel(
            file.originalname,
            [{ invoiceId: "SYSTEM", message: err.message }],
            source
          );

          await updateImportJobLog(jobId, "FAILED", err.message, {
            errors: [{ row: "SYS", sku: "CRITICAL", message: err.message }],
            download_url: downloadUrl,
          });
          batchSummary.errors.push({ file: file.originalname, message: err.message });
        }
      }

      res.json({
        success: true,
        message: `Selesai. ${batchSummary.processedFiles} file diproses.`,
        data: batchSummary,
      });
    } catch (error) {
      console.error("[Batch Upload Error]", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// 3. Pending Items
router.get("/pending-items", async (_, res) => {
  const sql = `
    SELECT
      pli.id, pli.quantity, pli.status,
      pl.original_invoice_id, pl.source, pl.order_date, pl.created_at,
      p.sku, p.name AS product_name,
      pli.picking_list_id,
      COALESCE(loc.code, (
        SELECT l2.code FROM stock_locations sl2 JOIN locations l2 ON sl2.location_id = l2.id
        WHERE sl2.product_id = pli.product_id AND l2.purpose = 'DISPLAY' AND sl2.quantity > 0
        ORDER BY sl2.quantity DESC LIMIT 1
      )) AS location_code,
      COALESCE(sl.quantity, 0) AS available_stock
    FROM picking_list_items pli
    JOIN picking_lists pl ON pli.picking_list_id = pl.id
    JOIN products p ON pli.product_id = p.id
    LEFT JOIN locations loc ON pli.suggested_location_id = loc.id
    LEFT JOIN stock_locations sl ON pli.product_id = sl.product_id AND pli.suggested_location_id = sl.location_id
    WHERE pli.status = 'PENDING_VALIDATION' AND (pl.is_active = 1 OR pl.is_active IS NULL)
    ORDER BY location_code ASC, p.sku ASC
  `;
  try {
    const [items] = await db.query(sql);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ message: "Gagal ambil data." });
  }
});

// 4. Complete Items
router.post("/complete-items", canAccess("confirm-picking-list"), async (req, res) => {
  try {
    const { completePickingItemsService } = await import("../services/pickingDataService.js");
    const result = await completePickingItemsService(req.body.itemIds, req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 5. Cancel
router.post("/cancel/:id", canAccess("void-picking-list"), async (req, res) => {
  try {
    const { cancelPickingListService } = await import("../services/pickingDataService.js");
    const result = await cancelPickingListService(
      req.params.id,
      req.user.id,
      "User Cancel via Web"
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. History & Details
router.get("/history-items", async (req, res) => {
  try {
    const { getHistoryPickingItemsService } = await import("../services/pickingDataService.js");
    const items = await getHistoryPickingItemsService(parseInt(req.query.limit) || 100);
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ message: "Gagal ambil history." });
  }
});

router.get("/:id", getPickingListDetails);

export default router;
