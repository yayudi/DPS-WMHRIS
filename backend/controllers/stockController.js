// backend/controllers/stockController.js
import * as stockService from "../services/stockService.js";
import * as jobService from "../services/jobService.js";

// ============================================================================
// CORE STOCK OPERATIONS (Transfer & Adjust)
// ============================================================================

export const transferStock = async (req, res) => {
  try {
    const { productId, fromLocationId, toLocationId, quantity, notes } = req.body;
    const userId = req.user.id;

    if (!productId || !fromLocationId || !toLocationId || !quantity) {
      return res.status(400).json({ success: false, message: "Data tidak lengkap." });
    }
    if (Number(quantity) <= 0) {
      return res.status(400).json({ success: false, message: "Jumlah harus lebih dari 0." });
    }
    if (fromLocationId === toLocationId) {
      return res
        .status(400)
        .json({ success: false, message: "Lokasi asal dan tujuan tidak boleh sama." });
    }

    const result = await stockService.transferStockService({
      productId,
      fromLocationId,
      toLocationId,
      quantity: Number(quantity),
      userId,
      notes,
    });

    res.json(result);
  } catch (error) {
    console.error("[StockController] Transfer Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const adjustStock = async (req, res) => {
  try {
    const { productId, locationId, quantity, notes } = req.body;
    const userId = req.user.id;

    if (!productId || !locationId || quantity === 0 || !notes) {
      return res.status(400).json({ success: false, message: "Data adjustment tidak lengkap." });
    }

    const result = await stockService.adjustStockService({
      productId,
      locationId,
      quantity: Number(quantity),
      userId,
      notes,
    });

    res.json(result);
  } catch (error) {
    console.error("[StockController] Adjust Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// IMPORT & ADJUSTMENT JOBS
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
    console.error("[StockController] Template Error:", error);
    res.status(500).json({ success: false, message: "Gagal membuat template." });
  }
};

export const requestAdjustmentUpload = async (req, res) => {
  const userId = req.user.id;
  const file = req.file;
  const { notes } = req.body;

  if (!file) {
    return res.status(400).json({ success: false, message: "File tidak ditemukan." });
  }

  try {
    // Menggunakan jobService untuk membuat job
    const jobId = await jobService.createJobService({
      userId,
      type: "ADJUST_STOCK",
      originalname: file.originalname,
      serverFilePath: file.path,
      notes,
    });
    res.status(202).json({ success: true, message: "File diterima.", jobId });
  } catch (error) {
    console.error("[StockController] Upload Request Error:", error);
    res.status(500).json({ success: false, message: "Gagal membuat job." });
  }
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
