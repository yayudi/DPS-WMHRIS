// backend/controllers/pickingController.js
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { fileURLToPath } from "url";

// Services
import * as pickingService from "../services/pickingDataService.js"; // Untuk Operasional (Get/Cancel/Complete)
import * as importService from "../services/pickingImportService.js"; // Untuk Logic Import
import * as jobService from "../services/jobService.js"; // Untuk Logging Job

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

    // Dynamic Import Parser
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
      let headerRowIndex = 1;

      try {
        // Create Job (via JobService)
        jobId = await jobService.createJobService({
          userId,
          type: jobType,
          originalname: file.originalname,
          serverFilePath: file.path,
          notes: "Processing Import...",
        });

        // PARSING
        console.log(`[CONTROLLER] Parsing file: ${file.path}`);
        const parseResult = await parser.run(file.path, source);

        if (parseResult.headerRowIndex) headerRowIndex = parseResult.headerRowIndex;

        // TANGKAP ERROR PARSING
        if (parseResult.errors && parseResult.errors.length > 0) {
          parseResult.errors.forEach((e) => {
            fileErrors.push({
              row: e.row || null,
              message: `[PARSER] ${e.message}`,
              invoiceId: e.invoiceId,
            });
          });
        }

        // FLATTEN DATA
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
              returnedQty: item.returnedQty || 0,
              row: item.row,
              originalFilename: file.originalname,
            });
          });
        });

        // VALIDASI & INSERT (via ImportService)
        let processResult = { processed: 0, errors: [] };

        if (parsedItems.length > 0) {
          processResult = await importService.performPickingValidation({
            items: parsedItems,
            userId,
            source,
            originalFilename: file.originalname,
          });
        }

        // MAPPING ERROR DARI SERVICE KE BARIS EXCEL
        if (processResult.errors && processResult.errors.length > 0) {
          processResult.errors.forEach((errObj) => {
            const invId = errObj.invoice;
            const errMsg = errObj.error;

            const affectedItems = parsedItems.filter((i) => i.invoiceId === invId);

            if (affectedItems.length > 0) {
              affectedItems.forEach((item) => {
                fileErrors.push({
                  row: item.row,
                  message: `[SISTEM] ${errMsg}`,
                  invoiceId: item.invoiceId,
                });
              });
            } else {
              fileErrors.push({ row: null, message: errMsg, invoiceId: invId || "GENERAL" });
            }
          });
        }

        // FINALIZE & REPORT
        batchSummary.processedFiles++;
        batchSummary.successInvoices += processResult.processed;

        if (fileErrors.length > 0) {
          // Generate Error Excel
          const downloadUrl = await generateComprehensiveErrorExcel(
            file.path,
            file.originalname,
            fileErrors,
            headerRowIndex
          );

          const logPayload = {
            summary: `${processResult.processed} Sukses, ${fileErrors.length} Baris Bermasalah.`,
            download_url: downloadUrl,
            errors: fileErrors.slice(0, 50),
          };

          // Update Job Failed/Partial (via JobService)
          await jobService.updateJobStatusService(
            jobId,
            "COMPLETED_WITH_ERRORS",
            logPayload.summary,
            logPayload
          );

          batchSummary.errors.push({
            filename: file.originalname,
            message: "Terdapat data gagal. Silakan unduh file perbaikan.",
            downloadUrl,
          });
        } else {
          // Update Job Success (via JobService)
          const successMsg = `Sukses. ${processResult.processed} Invoice diproses.`;
          await jobService.updateJobStatusService(jobId, "COMPLETED", successMsg, {
            processed: processResult.processed,
          });
        }
      } catch (err) {
        console.error(`Fatal Error file ${file.originalname}:`, err);
        const fatalMsg = err.message || "Kesalahan Sistem Fatal";

        const downloadUrl = await generateSimpleErrorExcel(file.originalname, [
          { message: fatalMsg },
        ]);
        batchSummary.errors.push({ filename: file.originalname, message: fatalMsg, downloadUrl });

        if (jobId) {
          await jobService.updateJobStatusService(jobId, "FAILED", `System Error: ${fatalMsg}`, {
            download_url: downloadUrl,
          });
        }
      } finally {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {}
        }
      }
    }

    res.json({
      success: true,
      message: `Proses Batch Selesai. ${batchSummary.successInvoices} Invoice Berhasil.`,
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
// PRIVATE HELPERS (EXCEL GENERATOR)
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR_ERRORS = path.join(__dirname, "..", "uploads", "error_reports");

if (!fs.existsSync(UPLOAD_DIR_ERRORS)) fs.mkdirSync(UPLOAD_DIR_ERRORS, { recursive: true });

export const generateComprehensiveErrorExcel = async (
  sourceFilePath,
  originalFilename,
  errors,
  headerRowIndex = 1
) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ext = path.extname(sourceFilePath).toLowerCase();

    if (ext === ".csv") {
      await workbook.csv.readFile(sourceFilePath);
    } else {
      await workbook.xlsx.readFile(sourceFilePath);
    }

    const worksheet = workbook.worksheets[0];

    // Setup Header Kolom Error
    const lastCol = worksheet.columnCount;
    const errorColIdx = lastCol + 1;

    const headerRow = worksheet.getRow(headerRowIndex);
    const errorHeaderCell = headerRow.getCell(errorColIdx);

    errorHeaderCell.value = ">>> KETERANGAN ERROR <<<";
    errorHeaderCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    errorHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC3545" } };

    const errorMap = new Map();
    errors.forEach((e) => {
      if (e.row) {
        const currentMsg = errorMap.get(e.row);
        errorMap.set(e.row, currentMsg ? `${currentMsg} | ${e.message}` : e.message);
      }
    });

    const totalRows = worksheet.rowCount;
    for (let r = totalRows; r > headerRowIndex; r--) {
      if (errorMap.has(r)) {
        const cell = worksheet.getRow(r).getCell(errorColIdx);
        cell.value = errorMap.get(r);
        cell.font = { color: { argb: "FFDC3545" }, bold: true };
      } else {
        // Hapus baris yang sukses agar user fokus ke error
        worksheet.spliceRows(r, 1);
      }
    }

    worksheet.getColumn(errorColIdx).width = 60;

    const timestamp = Date.now();
    const safeName = path.parse(originalFilename).name.replace(/[^a-z0-9]/gi, "_");
    const filename = `REPAIR_${safeName}_${timestamp}.xlsx`;
    const absolutePath = path.join(UPLOAD_DIR_ERRORS, filename);

    await workbook.xlsx.writeFile(absolutePath);
    return `/uploads/error_reports/${filename}`;
  } catch (e) {
    console.error("Comprehensive Excel Gen Error:", e);
    return generateSimpleErrorExcel(originalFilename, errors);
  }
};

export const generateSimpleErrorExcel = async (originalFilename, failedItems) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data Error");

    sheet.columns = [
      { header: "No.", key: "row", width: 10 },
      { header: "Pesan Error", key: "message", width: 60 },
      { header: "Detail Lain", key: "detail", width: 30 },
    ];

    failedItems.forEach((item) => {
      sheet.addRow({
        row: item.row || "-",
        message: item.message || "Unknown Error",
        detail: item.invoiceId || "",
      });
    });

    const timestamp = Date.now();
    const safeName = path.parse(originalFilename).name.replace(/[^a-z0-9]/gi, "_");
    const filename = `ERROR_LOG_${safeName}_${timestamp}.xlsx`;
    const absolutePath = path.join(UPLOAD_DIR_ERRORS, filename);

    await workbook.xlsx.writeFile(absolutePath);
    return `/uploads/error_reports/${filename}`;
  } catch (e) {
    console.error("Simple Excel Gen Error:", e);
    return null;
  }
};
