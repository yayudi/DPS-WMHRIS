// backend/controllers/pickingController.js
import db from "../config/db.js";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";
import * as pickingService from "../services/pickingDataService.js";
// Service Import tidak perlu diekspor langsung, cukup dipakai via performPickingValidation di pickingDataService.js
// Tapi karena kita sudah memisahkan logic, kita pakai pickingDataService sebagai facade.

// ============================================================================
// READ OPERATIONS (GET)
// ============================================================================

/**
 * Mengambil item-item yang statusnya PENDING/VALIDATED untuk ditampilkan di Daftar Tugas.
 */
export const getPendingItems = async (req, res) => {
  try {
    const items = await pickingService.getPendingPickingItemsService();
    res.json({ success: true, data: items });
  } catch (error) {
    console.error("[Controller] Get Pending Items Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Mengambil riwayat picking list (Arsip yang sudah selesai/batal).
 */
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

/**
 * Mengambil detail item spesifik dari satu picking list ID (untuk Modal Detail).
 */
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

/**
 * Menangani upload file mentah (Excel/CSV) dari form upload.
 * Melakukan parsing -> normalisasi -> validasi -> insert DB.
 */
export const uploadAndValidate = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new Error("Tidak ada file yang diunggah.");
    }

    const userId = req.user?.id || 1;
    const source = req.body.source || "Tokopedia";
    const jobType = `IMPORT_SALES_${source.toUpperCase()}`; // Ex: IMPORT_SALES_TOKOPEDIA

    // Import parser engine
    const { ParserEngine } = await import("../services/ParserEngine.js");
    const parser = new ParserEngine();

    const batchSummary = {
      totalFiles: req.files.length,
      processedFiles: 0,
      successInvoices: 0,
      errors: [],
    };

    // LOOP PER FILE (Agar log import_jobs tercatat per file)
    for (const file of req.files) {
      let jobId = null;
      let fileErrors = []; // Menampung error parsing + validasi logic
      let parsedItems = []; // Item hasil parsing

      try {
        // 1. [LOG START] Buat entry 'PROCESSING' di DB
        jobId = await createImportJobLog(userId, file.originalname, jobType, "PROCESSING");

        // 2. PARSING FILE
        const parseResult = await parser.run(file.path, source);

        // Cek error parsing (misal struktur kacau)
        if (parseResult.errors && parseResult.errors.length > 0) {
          parseResult.errors.forEach((e) => {
            fileErrors.push({
              invoiceId: "PARSING_ERROR",
              sku: "ROW " + (e.row || "?"),
              qty: 0,
              message: e.message,
            });
          });
        }

        // Flatten hasil parsing ke array standar
        parseResult.orders.forEach((orderData) => {
          orderData.items.forEach((item) => {
            parsedItems.push({
              invoiceId: orderData.invoiceId,
              customer: orderData.customer,
              orderDate: orderData.orderDate,
              source: source,
              status: orderData.status, // MP_STATUS
              sku: item.sku,
              qty: item.qty,
            });
          });
        });

        // 3. VALIDASI & SIMPAN KE DB (Jika ada item hasil parsing)
        let processResult = { processedInvoices: 0, validItems: [], invalidSkus: [] };

        if (parsedItems.length > 0) {
          processResult = await pickingService.performPickingValidation({
            items: parsedItems,
            userId,
            source,
            originalFilename: file.originalname,
          });
        }

        // 4. CEK HASIL VALIDASI LOGIC (Stok/SKU Unknown)
        // performPickingValidation mengembalikan invalidSkus sebagai array string "[INV-123] Error msg"
        if (processResult.invalidSkus && processResult.invalidSkus.length > 0) {
          processResult.invalidSkus.forEach((msg) => {
            // Regex sederhana untuk memisahkan Invoice ID dari pesan
            const match = msg.match(/^\[(.*?)\] (.*)/);
            const invId = match ? match[1] : "UNKNOWN";
            const errMsg = match ? match[2] : msg;

            fileErrors.push({
              invoiceId: invId,
              sku: "VALIDATION",
              qty: 0,
              message: errMsg,
            });
          });
        }

        // 5. [LOG UPDATE] Tentukan Status Akhir & Generate Excel jika perlu
        batchSummary.processedFiles++;
        batchSummary.successInvoices += processResult.processedInvoices;

        if (fileErrors.length > 0) {
          // Ada error (Parsing atau Logic) -> Generate Excel Repair
          const downloadUrl = await generateErrorExcel(file.originalname, fileErrors, source);

          const logPayload = {
            summary: `${processResult.processedInvoices} Sukses, ${fileErrors.length} Gagal.`,
            download_url: downloadUrl,
            errors: fileErrors.slice(0, 50), // Simpan max 50 error di JSON DB agar tidak bloated
          };

          await updateImportJobLog(jobId, "COMPLETED_WITH_ERRORS", logPayload.summary, logPayload);

          batchSummary.errors.push({
            filename: file.originalname,
            message: "Sebagian data gagal diproses.",
            downloadUrl,
          });
        } else {
          // Sukses Sempurna
          const successMsg = `Sukses. ${processResult.processedInvoices} Invoice diproses.`;
          await updateImportJobLog(jobId, "COMPLETED", successMsg, {
            processed: processResult.processedInvoices,
          });
        }
      } catch (err) {
        console.error(`Fatal Error file ${file.originalname}:`, err);

        // Error Fatal (System Crash saat proses file ini)
        const fatalMsg = err.message || "Kesalahan Sistem";
        batchSummary.errors.push({ filename: file.originalname, message: fatalMsg });

        if (jobId) {
          await updateImportJobLog(jobId, "FAILED", `System Error: ${fatalMsg}`);
        }
      }
    }

    // Response ke Frontend
    res.json({
      success: true,
      message: `Batch selesai. ${batchSummary.successInvoices} Invoice baru masuk sistem.`,
      data: batchSummary,
    });
  } catch (error) {
    console.error("[Controller] Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * [Optional] Handle Batch Upload dari JSON mentah (jika ada fitur re-upload perbaikan di frontend)
 */
export const handleBatchUploadJson = async (req, res) => {
  try {
    const { items, source, filename } = req.body;
    const userId = req.user?.id || 1;

    const result = await pickingService.performPickingValidation({
      items,
      userId,
      source,
      originalFilename: filename,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[Controller] Batch JSON Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// ACTION OPERATIONS (POST - Cancel & Complete)
// ============================================================================

/**
 * Membatalkan Picking List secara manual.
 */
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

/**
 * Menyelesaikan Item Picking (Checklist barang sudah diambil).
 */
export const completeItems = async (req, res) => {
  try {
    const { itemIds } = req.body;
    const userId = req.user?.id || 1;

    if (!itemIds || itemIds.length === 0) {
      throw new Error("Tidak ada item yang dipilih.");
    }

    const result = await pickingService.completePickingItemsService(itemIds, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// PRIVATE HELPERS (Pindahan dari Router Lama)
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR_ERRORS = path.join(__dirname, "..", "uploads", "error_reports");

if (!fs.existsSync(UPLOAD_DIR_ERRORS)) fs.mkdirSync(UPLOAD_DIR_ERRORS, { recursive: true });

// Helper 1: Logging DB
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

// Helper 2: Excel Generator
export const generateErrorExcel = async (originalFilename, failedItems, source) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DATA PERBAIKAN");

    // Header Config (Sederhana)
    sheet.columns = [
      { header: "Order ID", key: "invoiceId", width: 25 },
      { header: "Seller SKU", key: "sku", width: 25 },
      { header: "Qty", key: "qty", width: 10 },
      {
        header: "Pesan Error",
        key: "message",
        width: 50,
        style: { font: { color: { argb: "FFFF0000" } } },
      },
    ];

    failedItems.forEach((item) => {
      sheet.addRow({
        invoiceId: item.invoiceId,
        sku: item.sku,
        qty: item.qty,
        message: item.message,
      });
    });

    const timestamp = Date.now();
    const safeName = path.parse(originalFilename).name.replace(/[^a-z0-9]/gi, "_");
    const filename = `REPAIR_${safeName}_${timestamp}.xlsx`;
    const absolutePath = path.join(UPLOAD_DIR_ERRORS, filename);

    await workbook.xlsx.writeFile(absolutePath);
    return `/uploads/error_reports/${filename}`;
  } catch (e) {
    console.error("Excel Gen Error:", e);
    return null;
  }
};
