import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import fs from "fs";

// --- SERVICES ---
import * as pickingService from "../services/pickingDataService.js";
import * as jobService from "../services/jobService.js";
import Logger from "../utils/logger.js";

// (Direktori error report sekarang ditangani worker, tapi bisa dibiarkan jika ada logic download legacy)

// ============================================================================
//                               READ OPERATIONS
// ============================================================================

/**
 * Get all pending picking items.
 */
export const getPendingItems = catchAsync(async (req, res, next) => {
  const items = await pickingService.getPendingPickingItemsService();
  res.json({ success: true, data: items });
});

/**
 * Get history of picking items.
 */
export const getHistoryItems = catchAsync(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 1000;
  const items = await pickingService.getHistoryPickingItemsService(limit);
  res.json({ success: true, data: items });
});

/**
 * Get details of a specific picking list.
 */
export const getPickingDetail = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const items = await pickingService.fetchPickingListDetails(id);
  res.json({ success: true, data: items });
});

// ============================================================================
//                             WRITE OPERATIONS
// ============================================================================

/**
 * Upload Picking/Sales Files (Job Queue Based).
 * Supports Dry Run mode via req.body.dryRun.
 */
export const uploadAndValidate = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new Error("Tidak ada file yang diunggah.");
    }

    const userId = req.user?.id || 1;
    const source = req.body.source || "Tokopedia";

    // Deteksi Dry Run
    // FormData mengirim boolean sebagai string 'true'
    const isDryRun = req.body.dryRun === "true" || req.body.dryRun === true;

    const locationPurpose = req.body.purpose || "DISPLAY";

    let shopNames = [];
    try {
      if (req.body.shopNames) {
        shopNames = JSON.parse(req.body.shopNames);
      }
    } catch (e) {
      Logger.warn("Failed to parse shopNames JSON", "PICKING_CTRL", e);
    }

    // Tentukan Base Job Type
    const baseJobType = `IMPORT_SALES_${source.toUpperCase()}`;

    // Append suffix jika dry run (Worker akan memotong suffix ini nanti)
    const jobType = isDryRun ? `${baseJobType}_DRY_RUN` : baseJobType;

    const createdJobs = [];

    // Loop setiap file yang diupload dan buatkan Job Antrian
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const shopName = shopNames[i] || null;

      // Tentukan catatan untuk Audit Trail / UI
      const modeText = isDryRun ? "Simulasi" : "Import";
      const defaultNote = `${modeText} ${source} Sales`;
      const userNotes = req.body.notes ? req.body.notes.trim() : "";
      const note = userNotes ? `${defaultNote} | ${userNotes}` : defaultNote;

      const jobId = await jobService.createJobService({
        userId,
        type: jobType,
        originalname: file.originalname,
        serverFilePath: file.path,
        notes: note,
        options: { purpose: locationPurpose, shopName },
      });

      Logger.info(`Job Created: ID ${jobId} (${modeText}) - ${file.originalname}`, "PICKING_CTRL");
      createdJobs.push(jobId);
    }

    // Response Cepat (Asynchronous)
    res.json({
      success: true,
      message: `${createdJobs.length} file masuk antrian.${isDryRun ? " (Mode Simulasi)" : ""}`,
      data: { jobIds: createdJobs }, // Return array job IDs
    });
  } catch (error) {
    Logger.error("Upload Error", error, "PICKING_CTRL");
    // Cleanup file jika gagal buat job
    if (req.files) {
      req.files.forEach((f) => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    return next(error);
  }
};

/**
 * Void a Picking List.
 */
export const voidPickingList = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.id || 1;
  await pickingService.voidPickingListService(id, userId);
  res.json({ success: true, message: "Picking List divoid (dibatalkan)." });
});

/**
 * Complete Picking items.
 */
export const completeItems = catchAsync(async (req, res, next) => {
  const { items } = req.body;
  const userId = req.user?.id || 1;

  const result = await pickingService.completePickingItemsService(items, userId);
  res.json(result);
});

/**
 * Retry backorders for a specific Picking List.
 */
export const retryBackorders = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const result = await pickingService.retryBackordersService(id);
  res.json(result);
});

/**
 * Retry backorders for multiple Picking Lists.
 */
export const retryBackordersBatch = catchAsync(async (req, res, next) => {
  const { pickingListIds } = req.body;
  const result = await pickingService.retryBackordersBatchService(pickingListIds);
  res.json(result);
});

/**
 * Update items (product and quantity) for a picking list.
 */
export const updatePickingItems = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { items } = req.body;
  const userId = req.user?.id || 1;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AppError("Daftar item tidak boleh kosong.", 400);
  }

  const result = await pickingService.updatePickingListItemsService(id, items, userId);
  res.json(result);
});

