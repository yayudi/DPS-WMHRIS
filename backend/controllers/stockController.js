// backend/controllers/stockController.js
import * as stockService from "../services/stockService.js";
import * as jobService from "../services/jobService.js";

// ============================================================================
//                               READ OPERATIONS
// ============================================================================

export const getAllStocks = async (req, res) => {
  try {
    // Implementasi get stock (biasanya filter/pagination)
    // ... (sesuaikan dengan logic lama jika ada, atau gunakan service)
    const stocks = await stockService.getAllStocks(req.query);
    res.json({ success: true, data: stocks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
//                             WRITE OPERATIONS
// ============================================================================

/**
 * Upload Stock Adjustment File (Job Queue Based).
 * Supports Dry Run mode via req.body.dryRun.
 */
export const uploadAdjustment = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Tidak ada file yang diunggah." });
    }

    const userId = req.user.id;
    // Deteksi flag dryRun dari form-data
    const isDryRun = req.body.dryRun === "true" || req.body.dryRun === true;

    // Tentukan Tipe Job
    const jobType = isDryRun ? "ADJUST_STOCK_DRY_RUN" : "ADJUST_STOCK";

    // Create Job
    const jobId = await jobService.createJobService({
      userId,
      type: jobType,
      originalname: req.file.originalname,
      serverFilePath: req.file.path,
      notes: isDryRun ? "Simulasi Stock Opname" : "Stock Opname",
    });

    res.json({
      success: true,
      message: isDryRun ? "Simulasi validasi stok berjalan..." : "File adjustment masuk antrian.",
      jobId: jobId,
    });
  } catch (error) {
    console.error("[StockController] Upload Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Transfer Stock antar Lokasi
 */
export const transferStock = async (req, res) => {
  try {
    const { productId, fromLocationId, toLocationId, quantity, notes } = req.body;
    const userId = req.user.id;

    if (!productId || !fromLocationId || !toLocationId || !quantity) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap." });
    }

    await stockService.transferStockService({
      productId,
      fromLocationId,
      toLocationId,
      quantity,
      userId,
      notes,
    });
    res.json({ success: true, message: "Transfer stok berhasil." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Adjust Stock Manual (Single Item)
 * Updated: Tidak lagi mewajibkan 'type'. Menggunakan quantity +/-.
 */
export const adjustStock = async (req, res) => {
  try {
    let { productId, locationId, quantity, type, notes } = req.body;
    const userId = req.user.id;

    // FIX: Hapus 'type' dari validasi wajib
    if (!productId || !locationId || quantity === undefined || quantity === null) {
      return res.status(400).json({ success: false, message: "Data adjustment tidak lengkap." });
    }

    // Logic Adaptor: Jika frontend mengirim type, sesuaikan tanda quantity
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
      quantity, // Service sekarang menerima signed quantity (negatif/positif)
      userId,
      notes,
    });
    res.json({ success: true, message: "Penyesuaian stok berhasil." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// BATCH PROCESS & HISTORY (Functions Restored)
// ============================================================================

export const downloadAdjustmentTemplate = async (req, res) => {
  try {
    const workbook = await stockService.generateAdjustmentTemplateService();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=Template_Adjustment_Stok.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal membuat template." });
  }
};

export const getInboundTemplate = async (req, res) => {
  try {
    const workbook = await stockService.generateInboundTemplateService();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=Template_Inbound_Stok.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("[StockController] Template Inbound Error:", error);
    res.status(500).json({ success: false, message: "Gagal membuat template inbound." });
  }
};

export const importBatchInbound = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Tidak ada file yang diunggah." });
    }

    const userId = req.user.id;
    // Create Job IMPORT_STOCK_INBOUND
    const jobId = await jobService.createJobService({
      userId,
      type: "IMPORT_STOCK_INBOUND",
      originalname: req.file.originalname,
      serverFilePath: req.file.path,
      notes: "Batch Stock Inbound",
    });

    res.json({
      success: true,
      message: "File inbound masuk antrian.",
      jobId: jobId,
    });
  } catch (error) {
    console.error("[StockController] Import Inbound Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const requestAdjustmentUpload = async (req, res) => {
  // Legacy wrapper - redirect to uploadAdjustment logic or deprecate
  // For now, reuse logic or call uploadAdjustment internally if structure allows
  return uploadAdjustment(req, res);
};

export const getImportJobs = async (req, res) => {
  try {
    // Menggunakan jobService
    const jobs = await jobService.getUserJobsService(req.user.id);
    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error("[StockController] Get Jobs Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat." });
  }
};

export const cancelImportJob = async (req, res) => {
  try {
    // Menggunakan jobService
    await jobService.cancelJobService(req.params.id, req.user.id);
    res.json({ success: true, message: "Antrian berhasil dibatalkan." });
  } catch (error) {
    console.error("[StockController] Cancel Job Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// BATCH PROCESS & HISTORY
// ============================================================================

export const processBatchMovements = async (req, res) => {
  try {
    const { type, fromLocationId, toLocationId, notes, movements } = req.body;
    if (!type || !Array.isArray(movements) || movements.length === 0) {
      return res.status(400).json({ success: false, message: "Data batch tidak valid." });
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
  } catch (error) {
    console.error("[StockController] Batch Process Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getStockHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const result = await stockService.getStockHistoryService(req.params.productId, page);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[StockController] History Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil riwayat stok." });
  }
};

export const batchTransfer = async (req, res) => {
  try {
    const { fromLocationId, toLocationId, movements } = req.body;
    if (!fromLocationId || !toLocationId || !Array.isArray(movements)) {
      return res.status(400).json({ success: false, message: "Input tidak valid." });
    }

    const result = await stockService.batchTransferService({
      fromLocationId,
      toLocationId,
      movements,
      userId: req.user.id,
      userRoleId: req.user.role_id,
    });
    res.json({ success: true, message: "Batch transfer berhasil.", ...result });
  } catch (error) {
    console.error("[StockController] Batch Transfer Error:", error);
    // Handle specific permission errors with 403 if needed
    const status = error.message.includes("Akses ditolak") ? 403 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getBatchLogs = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Tanggal wajib diisi." });
    }

    const logs = await stockService.getBatchLogsService(startDate, endDate);
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error("[StockController] Batch Log Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengambil log." });
  }
};

export const validateReturn = async (req, res) => {
  try {
    const { pickingListItemId, returnToLocationId } = req.body;
    if (!pickingListItemId || !returnToLocationId) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap." });
    }

    const result = await stockService.validateReturnService({
      pickingListItemId,
      returnToLocationId,
      userId: req.user.id,
    });
    res.json(result);
  } catch (error) {
    console.error("[StockController] Validate Return Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};
