// backend/controllers/returnController.js
import * as returnService from "../services/returnService.js";
import catchAsync from "../utils/catchAsync.js";

/**
 * GET: Ambil daftar barang yang statusnya RETURNED
 * (Barang retur dari marketplace yang sudah sampai gudang tapi belum divalidasi)
 */
export const getPendingReturns = catchAsync(async (req, res) => {
  const result = await returnService.getPendingReturnsService(req.query);

  res.json({
    success: true,
    data: result.rows,
    pagination: result.pagination,
  });
});

/**
 * GET: Ambil Riwayat Retur
 * Menggabungkan data retur marketplace dan retur manual
 */
export const getReturnHistory = catchAsync(async (req, res) => {
  const result = await returnService.getReturnHistoryService(req.query);

  res.json({
    success: true,
    data: result.rows,
    pagination: result.pagination,
  });
});

/**
 * POST: Validasi & Terima Barang Retur (Picking Item)
 * Menangani Full Return maupun Partial Return (Split)
 */
export const approveReturn = catchAsync(async (req, res) => {
  const userContext = { userId: req.user?.id || 1 };
  const result = await returnService.approveReturnService(req.body, userContext);

  res.json(result);
});

/**
 * POST: Retur Manual (Barang Nyasar / Offline / Tanpa Picking List)
 */
export const createManualReturn = catchAsync(async (req, res) => {
  const userContext = { userId: req.user?.id || 1 };
  const result = await returnService.createManualReturnService(req.body, userContext);

  res.json(result);
});
