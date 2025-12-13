// backend/controllers/pickingController.js
import db from "../config/db.js";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import * as pickingService from "../services/pickingDataService.js";

// ============================================================================
// READ OPERATIONS (GET)
// ============================================================================

export const getPendingItems = async (req, res) => {
  try {
    const items = await pickingService.getPendingPickingItemsService();
    res.json({ success: true, data: items });
  } catch (error) {
    console.error("[Controller] Get Pending Items Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getHistoryItems = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 1000;
    const items = await pickingService.getHistoryPickingItemsService(limit);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error("[Controller] Get History Items Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPickingDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const items = await pickingService.fetchPickingListDetails(id);
    res.json({ success: true, data: items });
  } catch (error) {
    console.error("[Controller] Get Detail Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// UPLOAD & PROCESS OPERATIONS (POST)
// ============================================================================

export const uploadAndValidate = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new Error("Tidak ada file yang diunggah.");
    }

    const userId = req.user?.id || 1;
    const source = req.body.source || "Tokopedia";
    const jobType = `IMPORT_SALES_${source.toUpperCase()}`;

    const { ParserEngine } = await import("../services/parsers/ParserEngine.js");
    const parser = new ParserEngine();

    const batchSummary = {
      totalFiles: req.files.length,
      processedFiles: 0,
      successInvoices: 0,
      errors: [],
    };

    // LOOP PER FILE
    for (const file of req.files) {
      let jobId = null;
      let fileErrors = [];
      let parsedItems = [];

      try {
        jobId = await createImportJobLog(userId, file.originalname, jobType, "PROCESSING");

        // 1. PARSING
        console.log(`[CONTROLLER] Parsing file: ${file.path}`);
        const parseResult = await parser.run(file.path, source);

        // 🕵️ DEBUG: CEK HASIL PARSER LANGSUNG (RAW DATA)
        // Kita ambil sample order pertama yang punya item retur (jika ada)
        console.log("---------------------------------------------------------------");
        console.log("[CONTROLLER DEBUG] Inspecting Parser Result (First 3 Orders):");
        let debugCount = 0;
        for (const [invId, order] of parseResult.orders) {
          if (debugCount >= 3) break;
          console.log(`Invoice: ${invId}`);
          console.table(
            order.items.map((i) => ({
              sku: i.sku,
              qty: i.qty,
              // Cek apakah key ini eksis di output parser
              returnedQty: i.returnedQty,
            }))
          );
          debugCount++;
        }
        console.log("---------------------------------------------------------------");

        // 2. TANGKAP ERROR PARSING
        if (parseResult.errors && parseResult.errors.length > 0) {
          parseResult.errors.forEach((e) => {
            fileErrors.push({
              invoiceId: e.invoiceId || "PARSING_ERROR",
              customer: e.customer || "-",
              sku: e.sku || "ROW " + (e.row || "?"),
              qty: e.qty || 0,
              status: e.status || "-",
              message: e.message,
            });
          });
        }

        // 3. FLATTEN DATA (Siapkan untuk Validasi & Insert)
        parseResult.orders.forEach((orderData) => {
          orderData.items.forEach((item) => {
            parsedItems.push({
              invoiceId: orderData.invoiceId,
              customer: orderData.customer,
              orderDate: orderData.orderDate,
              source: source,
              status: orderData.status,

              sku: item.sku,
              qty: item.qty,
              returnedQty: item.returnedQty || 0, // [CHECKPOINT] Apakah ini masuk?
              row: item.row,
              originalFilename: file.originalname,
            });
          });
        });

        // 4. VALIDASI LOGIC & INSERT DB
        let processResult = { processedInvoices: 0, validItems: [], invalidSkus: [] };

        if (parsedItems.length > 0) {
          processResult = await pickingService.performPickingValidation({
            items: parsedItems,
            userId,
            source,
            originalFilename: file.originalname,
          });
        }

        // 5. TANGKAP ERROR LOGIC
        if (processResult.invalidSkus && processResult.invalidSkus.length > 0) {
          processResult.invalidSkus.forEach((msg) => {
            const match = msg.match(/^\[(.*?)\] (.*)/);
            const invId = match ? match[1] : null;
            const errMsg = match ? match[2] : msg;

            const originalItems = parsedItems.filter((i) => i.invoiceId === invId);

            if (originalItems.length > 0) {
              originalItems.forEach((orig) => {
                if (errMsg.includes(orig.sku) || errMsg.includes("Komponen")) {
                  fileErrors.push({
                    invoiceId: orig.invoiceId,
                    customer: orig.customer,
                    sku: orig.sku,
                    qty: orig.qty,
                    status: orig.status,
                    message: errMsg,
                  });
                } else {
                  fileErrors.push({ ...orig, message: errMsg });
                }
              });
            } else {
              fileErrors.push({
                invoiceId: invId || "UNKNOWN",
                sku: "UNKNOWN",
                qty: 0,
                message: errMsg,
              });
            }
          });
        }

        // 6. FINALIZE
        batchSummary.processedFiles++;
        batchSummary.successInvoices += processResult.processedInvoices;

        if (fileErrors.length > 0) {
          const downloadUrl = await generateErrorExcel(file.originalname, fileErrors, source);
          const logPayload = {
            summary: `${processResult.processedInvoices} Sukses, ${fileErrors.length} Baris Bermasalah.`,
            download_url: downloadUrl,
            errors: fileErrors.slice(0, 50),
          };
          await updateImportJobLog(jobId, "COMPLETED_WITH_ERRORS", logPayload.summary, logPayload);
          batchSummary.errors.push({
            filename: file.originalname,
            message: "Sebagian data gagal. Download file perbaikan.",
            downloadUrl,
          });
        } else {
          const successMsg = `Sukses. ${processResult.processedInvoices} Invoice diproses.`;
          await updateImportJobLog(jobId, "COMPLETED", successMsg, {
            processed: processResult.processedInvoices,
          });
        }
      } catch (err) {
        console.error(`Fatal Error file ${file.originalname}:`, err);
        const fatalMsg = err.message || "Kesalahan Sistem";
        const downloadUrl = await generateErrorExcel(
          file.originalname,
          [{ invoiceId: "SYSTEM", message: fatalMsg }],
          source
        );
        batchSummary.errors.push({ filename: file.originalname, message: fatalMsg });
        if (jobId) {
          await updateImportJobLog(jobId, "FAILED", `System Error: ${fatalMsg}`, {
            download_url: downloadUrl,
          });
        }
      }
    }

    res.json({
      success: true,
      message: `Batch selesai. ${batchSummary.successInvoices} Invoice masuk.`,
      data: batchSummary,
    });
  } catch (error) {
    console.error("[Controller] Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelPickingList = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || 1;
    await pickingService.cancelPickingListService(id, userId);
    res.json({ success: true, message: "Picking List dibatalkan." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const completeItems = async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user?.id || 1;

    if (!items || !Array.isArray(items)) {
      throw new Error("Format data tidak valid. Harap kirim array items.");
    }

    const result = await pickingService.completePickingItemsService(items, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR_ERRORS = path.join(__dirname, "..", "uploads", "error_reports");

if (!fs.existsSync(UPLOAD_DIR_ERRORS)) fs.mkdirSync(UPLOAD_DIR_ERRORS, { recursive: true });

const SOURCE_HEADERS = {
  Tokopedia: [
    { header: "Order ID", key: "invoiceId", width: 25 },
    { header: "Recipient", key: "customer", width: 25 },
    { header: "Seller SKU", key: "sku", width: 25 },
    { header: "Quantity", key: "qty", width: 10 },
    { header: "Status", key: "status", width: 25 },
    { header: ">> ALASAN ERROR <<", key: "message", width: 50 },
  ],
  Shopee: [
    { header: "No. Pesanan", key: "invoiceId", width: 25 },
    { header: "Nama Penerima", key: "customer", width: 25 },
    { header: "Nomor Referensi SKU", key: "sku", width: 25 },
    { header: "Jumlah", key: "qty", width: 10 },
    { header: "Status", key: "status", width: 25 },
    { header: ">> ALASAN ERROR <<", key: "message", width: 50 },
  ],
  Offline: [
    { header: "*Nomor Tagihan", key: "invoiceId", width: 25 },
    { header: "*Nama Kontak", key: "customer", width: 25 },
    { header: "*Kode Produk (SKU)", key: "sku", width: 25 },
    { header: "*Jumlah Produk", key: "qty", width: 10 },
    { header: "Status", key: "status", width: 25 },
    { header: ">> ALASAN ERROR <<", key: "message", width: 50 },
  ],
};

export const createImportJobLog = async (userId, filename, jobType, status = "PENDING") => {
  try {
    const [res] = await db.query(
      `INSERT INTO import_jobs (user_id, job_type, original_filename, file_path, status, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, NOW(), NOW())`,
      [userId, jobType, filename, status]
    );
    return res.insertId;
  } catch (e) {
    console.error("Log DB Error:", e);
    return null;
  }
};

export const updateImportJobLog = async (jobId, status, summaryText, errorLogObj = null) => {
  if (!jobId) return;
  try {
    const errorLogStr = errorLogObj ? JSON.stringify(errorLogObj) : null;
    await db.query(
      `UPDATE import_jobs SET status = ?, log_summary = ?, error_log = ?, updated_at = NOW() WHERE id = ?`,
      [status, summaryText, errorLogStr, jobId]
    );
  } catch (e) {
    console.error("Update Log DB Error:", e);
  }
};

export const generateErrorExcel = async (originalFilename, failedItems, source) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DATA PERBAIKAN");

    const columnsConfig = SOURCE_HEADERS[source] || SOURCE_HEADERS["Tokopedia"];
    sheet.columns = columnsConfig;

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C3E50" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    const lastColIdx = columnsConfig.length;
    headerRow.getCell(lastColIdx).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDC3545" },
    };

    failedItems.forEach((item) => {
      const rowData = {
        invoiceId: item.invoiceId || "UNKNOWN",
        customer: item.customer || "",
        sku: item.sku || "",
        qty: item.qty || 0,
        status: item.status || "",
        message: item.message || "Error tidak diketahui",
      };

      const row = sheet.addRow(rowData);
      row.getCell("message").font = { color: { argb: "FFDC3545" }, bold: true };
    });

    const timestamp = Date.now();
    const safeName = path.parse(originalFilename).name.replace(/[^a-z0-9]/gi, "_");
    const filename = `REPAIR_${source}_${safeName}_${timestamp}.xlsx`;
    const absolutePath = path.join(UPLOAD_DIR_ERRORS, filename);

    await workbook.xlsx.writeFile(absolutePath);
    return `/uploads/error_reports/${filename}`;
  } catch (e) {
    console.error("Excel Gen Error:", e);
    return null;
  }
};
