import catchAsync from "../utils/catchAsync.js";
import * as stockService from "../services/stockService.js";
import * as jobService from "../services/jobService.js";
import * as jobRepo from "../repositories/jobRepository.js";
import db from "../config/db.js";
import { EXPORT_JOB_TYPE, IMPORT_JOB_TYPE } from "../config/jobConstants.js";

import AppError from "../utils/AppError.js";
// ============================================================================
//                               READ OPERATIONS
// ============================================================================

export const getAllStocks = catchAsync(async (req, res, next) => {
  const stocks = await stockService.getAllStocks(req.query);
  res.json({ success: true, data: stocks });
});

// ============================================================================
//                             WRITE OPERATIONS
// ============================================================================

/**
 * Upload Stock Adjustment File (Job Queue Based).
 * Supports Dry Run mode via req.body.dryRun.
 */
export const uploadAdjustment = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Tidak ada file yang diunggah.", 400));
  }

  const userId = req.user.id;
  const isDryRun = req.body.dryRun === "true" || req.body.dryRun === true;
  const jobType = isDryRun ? "ADJUST_STOCK_DRY_RUN" : "ADJUST_STOCK";

  // Create Job
  const jobId = await jobService.createJobService({
    userId,
    type: jobType,
    originalname: req.file.originalname,
    serverFilePath: req.file.path,
    notes: req.body.notes || (isDryRun ? "Simulasi Stock Opname" : "Stock Opname"),
  });

  res.json({
    success: true,
    message: isDryRun ? "Simulasi validasi stok berjalan..." : "File adjustment masuk antrian.",
    jobId: jobId,
  });
});

/**
 * Transfer Stock antar Lokasi
 */
export const transferStock = catchAsync(async (req, res, next) => {
  const { productId, fromLocationId, toLocationId, quantity, notes } = req.body;
  const userId = req.user.id;

  await stockService.transferStockService({
    productId,
    fromLocationId,
    toLocationId,
    quantity,
    userId,
    notes,
  });
  res.json({ success: true, message: "Transfer stok berhasil." });
});

/**
 * Adjust Stock Manual (Single Item)
 * Updated: Tidak lagi mewajibkan 'type'. Menggunakan quantity +/-.
 */
export const adjustStock = catchAsync(async (req, res, next) => {
  const { productId, locationId, type, notes } = req.body;
  let { quantity } = req.body;
  const userId = req.user.id;
  if (type) {
    if ((type === "ADJUST_MINUS" || type === "OUT") && quantity > 0) {
      quantity = -quantity;
    } else if ((type === "ADJUST_PLUS" || type === "IN") && quantity < 0) {
      quantity = Math.abs(quantity);
    }
  }
  await stockService.adjustStockService({
    productId,
    locationId,
    quantity,
    userId,
    notes,
  });
  res.json({ success: true, message: "Penyesuaian stok berhasil." });
});

// ============================================================================
// BATCH PROCESS & HISTORY (Functions Restored)
// ============================================================================

export const downloadAdjustmentTemplate = catchAsync(async (req, res, next) => {
  const workbook = await stockService.generateAdjustmentTemplateService();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", "attachment; filename=Template_Adjustment_Stok.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

export const getInboundTemplate = catchAsync(async (req, res, next) => {
  const workbook = await stockService.generateInboundTemplateService();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", "attachment; filename=Template_Inbound_Stok.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

export const importBatchInbound = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Tidak ada file yang diunggah.", 400));
  }

  const userId = req.user.id;
  const userNotes = req.body.notes ? req.body.notes.trim() : "";
  const finalNotes = userNotes ? `Batch Stock Inbound | ${userNotes}` : "Batch Stock Inbound";

  const jobId = await jobService.createJobService({
    userId,
    type: IMPORT_JOB_TYPE.STOCK_INBOUND,
    originalname: req.file.originalname,
    serverFilePath: req.file.path,
    notes: finalNotes,
  });

  res.json({
    success: true,
    message: "File inbound masuk antrian.",
    jobId: jobId,
  });
});

export const requestAdjustmentUpload = catchAsync(async (req, res) => {
  return uploadAdjustment(req, res);
});

export const getImportJobs = catchAsync(async (req, res, next) => {
  const jobs = await jobService.getUserJobsService(req.user.id, req.user.role, [
    "ADJUST_STOCK",
    "ADJUST_STOCK_DRY_RUN",
  ]);
  res.json({ success: true, data: jobs });
});

export const voidImportJob = catchAsync(async (req, res, next) => {
  await jobService.voidJobService(req.params.id, req.user.id);
  res.json({ success: true, message: "Antrian berhasil divoid (dibatalkan)." });
});

// ============================================================================
// BATCH PROCESS & HISTORY
// ============================================================================
export const processBatchMovements = catchAsync(async (req, res, next) => {
  const { type, fromLocationId, toLocationId, notes, movements } = req.body;

  if (type === "OPNAME") {
    const mappedMovements = movements.map((m) => ({
      sku: m.sku,
      quantity: m.quantity,
      toLocationId: m.toLocationId || toLocationId,
      notes: m.notes || notes,
    }));
    const result = await stockService.processBatchOpnameService({
      movements: mappedMovements,
      userId: req.user.id,
      userRoleId: req.user.role_id,
    });
    return res.json({ success: true, message: `Batch Opname berhasil.`, ...result });
  }

  const result = await stockService.processBatchMovementsService({
    type,
    fromLocationId,
    toLocationId,
    notes,
    movements,
    userId: req.user.id,
    userRoleId: req.user.role_id,
  });
  res.json({ success: true, message: `Batch ${type} berhasil.`, ...result });
});

export const getStockHistory = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const movementType = req.query.movementType || null;
  const startDate = req.query.startDate || null;
  const endDate = req.query.endDate || null;
  const locationId = req.query.locationId || null;
  const user = req.query.user || null;
  const result = await stockService.getStockHistoryService(
    req.params.productId,
    page,
    15,
    movementType,
    startDate,
    endDate,
    locationId,
    user,
  );
  res.json({ success: true, ...result });
});

export const batchTransfer = catchAsync(async (req, res) => {
  const { fromLocationId, toLocationId, movements } = req.body;

  const result = await stockService.batchTransferService({
    fromLocationId,
    toLocationId,
    movements,
    userId: req.user.id,
    userRoleId: req.user.role_id,
  });
  res.json({ success: true, message: "Batch transfer berhasil.", ...result });
});

export const getBatchLogs = catchAsync(async (req, res, next) => {
  const {
    startDate,
    endDate,
    productName,
    movementType,
    sourceLocation,
    destinationLocation,
    userId,
    notes,
    page,
    limit,
  } = req.query;

  const result = await stockService.getBatchLogsService({
    startDate,
    endDate,
    productName,
    movementType,
    sourceLocation,
    destinationLocation,
    userId,
    notes,
    page,
    limit,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

export const requestBatchLogExport = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const {
    startDate,
    endDate,
    productName,
    movementType,
    sourceLocation,
    destinationLocation,
    notes,
    format,
  } = req.body;

  const filters = {
    startDate,
    endDate,
    productName,
    movementType,
    sourceLocation,
    destinationLocation,
    notes,
    format: format || "xlsx",
    exportType: EXPORT_JOB_TYPE.BATCH_LOG_EXPORT,
  };

  const jobId = await jobRepo.createExportJob(db, {
    userId,
    filters,
    jobType: EXPORT_JOB_TYPE.BATCH_LOG_EXPORT,
  });

  res.status(202).json({
    success: true,
    message: "Permintaan ekspor batch log diterima. File sedang diproses.",
    jobId,
  });
});

export const validateReturn = catchAsync(async (req, res, next) => {
  const { pickingListItemId, returnToLocationId } = req.body;

  const result = await stockService.validateReturnService({
    pickingListItemId,
    returnToLocationId,
    userId: req.user.id,
  });
  res.json(result);
});

export const getMovementTypes = catchAsync(async (req, res, next) => {
  const types = await stockService.getMovementTypesService();
  res.json({ success: true, data: types });
});
