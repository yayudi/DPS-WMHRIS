// backend/controllers/pickingController.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- SERVICES ---
import * as pickingService from "../services/pickingDataService.js";
import * as jobService from "../services/jobService.js";

// --- CONFIG ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// (Direktori error report sekarang ditangani worker, tapi bisa dibiarkan jika ada logic download legacy)

// ============================================================================
//                               READ OPERATIONS
// ============================================================================

/**
 * Get all pending picking items.
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
 * Get history of picking items.
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
 * Get details of a specific picking list.
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
//                             WRITE OPERATIONS
// ============================================================================

/**
 * Upload Picking/Sales Files (Job Queue Based).
 * Supports Dry Run mode via req.body.dryRun.
 */
export const uploadAndValidate = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new Error("Tidak ada file yang diunggah.");
    }

    const userId = req.user?.id || 1;
    const source = req.body.source || "Tokopedia";

    // [UPDATE] Deteksi Dry Run
    // FormData mengirim boolean sebagai string 'true'
    const isDryRun = req.body.dryRun === "true" || req.body.dryRun === true;

    // Tentukan Base Job Type
    let baseJobType = `IMPORT_SALES_${source.toUpperCase()}`;

    // Append suffix jika dry run (Worker akan memotong suffix ini nanti)
    const jobType = isDryRun ? `${baseJobType}_DRY_RUN` : baseJobType;

    const createdJobs = [];

    // Loop setiap file yang diupload dan buatkan Job Antrian
    for (const file of req.files) {
      // Tentukan catatan untuk Audit Trail / UI
      const modeText = isDryRun ? "Simulasi" : "Import";
      const note = `${modeText} ${source} Sales`;

      const jobId = await jobService.createJobService({
        userId,
        type: jobType,
        originalname: file.originalname,
        serverFilePath: file.path,
        notes: note,
      });

      console.log(
        `[PickingController] Job Created: ID ${jobId} (${modeText}) - ${file.originalname}`
      );
      createdJobs.push(jobId);
    }

    // Response Cepat (Asynchronous)
    res.json({
      success: true,
      message: `${createdJobs.length} file masuk antrian.${isDryRun ? " (Mode Simulasi)" : ""}`,
      data: { jobIds: createdJobs }, // Return array job IDs
    });
  } catch (error) {
    console.error("[Controller] Upload Error:", error);
    // Cleanup file jika gagal buat job
    if (req.files) {
      req.files.forEach((f) => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Cancel a Picking List.
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
 * Complete Picking items.
 */
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
