// backend/services/stockRequestService.js
import Logger from "../utils/logger.js";
import { processBatchMovementsService, processBatchOpnameService } from "./stockService.js";
import { signals } from "./firebaseSignalService.js";
import * as stockRequestRepo from "../repositories/stockRequestRepository.js";
import * as notificationService from "./notificationService.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";
import { STOCK_REQUEST_STATUS, STOCK_REQUEST_TYPE } from "../config/wmsConstants.js";

/**
 * Membuat permintaan stok (bulk)
 */
export const createStockRequestService = async (payload, userId) => {
  const fullPayload = { ...payload, requesterId: userId };
  const type = payload.type || STOCK_REQUEST_TYPE.TRANSFER;

  // Validasi basic
  if (type === STOCK_REQUEST_TYPE.TRANSFER) {
    if (!payload.fromLocationId || !payload.toLocationId) {
      throw new Error("Lokasi asal dan tujuan harus diisi untuk transfer.");
    }
    if (payload.fromLocationId === payload.toLocationId) {
      throw new Error("Lokasi asal dan tujuan tidak boleh sama.");
    }
  } else if (type === STOCK_REQUEST_TYPE.STOCK_OPNAME) {
    if (!payload.toLocationId) {
      throw new Error("Lokasi opname harus diisi.");
    }
  }

  if (!payload.items || payload.items.length === 0) {
    throw new Error("Minimal harus ada satu produk yang diminta.");
  }

  const requestId = await withTransaction(async (connection) => {
    return await stockRequestRepo.createStockRequest(connection, fullPayload);
  });

  signals.refreshRequests();

  // Notifikasi ke user dengan permission approve-stock-requests
  notificationService
    .notifyUsersByPermission(
      "approve-stock-requests",
      "WMS",
      "Permintaan Stok Baru",
      `Permintaan stok baru (${type}) telah dibuat dan menunggu persetujuan.`,
      { requestId, type },
      userId,
      true,
    )
    .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));

  return { success: true, message: "Permintaan stok berhasil dibuat.", requestId };
};

/**
 * Mendapatkan semua request dengan filter
 */
export const getStockRequestsService = async (filters) => {
  const result = await withConnection(async (connection) => {
    return await stockRequestRepo.getStockRequests(connection, filters);
  });
  return {
    success: true,
    data: result.data,
    pagination: result.pagination,
  };
};

/**
 * Approve Permintaan Stok (Oleh Pihak Pengirim)
 */
export const approveStockRequestService = async (requestId, user) => {
  let isOpname = false;
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    if (!request) throw new Error("Permintaan stok tidak ditemukan.");
    if (request.status !== STOCK_REQUEST_STATUS.PENDING)
      throw new Error("Hanya permintaan berstatus PENDING yang dapat disetujui.");

    // Cegah self-approval
    if (request.requester_id === user.id) {
      throw new Error("Anda tidak dapat menyetujui permintaan Anda sendiri.");
    }

    requestData = request;

    if (request.type === STOCK_REQUEST_TYPE.STOCK_OPNAME) {
      isOpname = true;
      const movements = request.items.map((reqItem) => ({
        sku: reqItem.sku,
        quantity: reqItem.quantity,
        toLocationId: request.to_location_id,
        notes: `Stock Request Opname ${request.request_number}`,
      }));

      await processBatchOpnameService({
        movements: movements,
        userId: user.id,
        userRoleId: user.role_id || 1,
      });

      for (const reqItem of request.items) {
        await stockRequestRepo.updateRequestItemReceived(connection, reqItem.id, reqItem.quantity);
      }

      await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.COMPLETED);
    } else {
      await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.APPROVED);
    }
  });

  signals.refreshRequests();

  if (isOpname) {
    notificationService
      .notifyUsers(
        [requestData.requester_id],
        "WMS",
        "Permintaan Opname Disetujui",
        `Permintaan stok opname ${requestData.request_number} telah disetujui dan stok disesuaikan.`,
        { requestId, requestNumber: requestData.request_number },
        true,
      )
      .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));

    return { success: true, message: "Permintaan stok opname disetujui dan stok disesuaikan." };
  }

  notificationService
    .notifyUsers(
      [requestData.requester_id],
      "WMS",
      "Permintaan Stok Disetujui",
      `Permintaan stok ${requestData.request_number} telah disetujui. Silakan lakukan konfirmasi penerimaan.`,
      { requestId, requestNumber: requestData.request_number },
      true,
    )
    .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));

  return { success: true, message: "Permintaan stok berhasil disetujui." };
};

/**
 * Dispatch Permintaan Stok (Oleh Pihak Pengirim)
 * Mengurangi stok dari gudang asal dan merubah status jadi SHIPPED
 */
export const dispatchStockRequestService = async (requestId, user) => {
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    if (!request) throw new Error("Permintaan stok tidak ditemukan.");
    if (request.status !== STOCK_REQUEST_STATUS.APPROVED)
      throw new Error("Hanya permintaan berstatus APPROVED yang dapat dikirim.");
    if (request.type === STOCK_REQUEST_TYPE.STOCK_OPNAME)
      throw new Error("Permintaan Stock Opname tidak memerlukan pengiriman.");

    requestData = request;

    // Deduct stock from sender (TRANSFER_OUT)
    const movements = request.items.map((reqItem) => ({
      sku: reqItem.sku,
      quantity: reqItem.quantity,
      fromLocationId: request.from_location_id,
      notes: `Pengiriman Permintaan Stok ${request.request_number}`,
    }));

    await processBatchMovementsService({
      type: "TRANSFER_OUT",
      fromLocationId: request.from_location_id,
      toLocationId: null, // Hanya pengurangan stok
      notes: `Pengiriman Stok ${request.request_number}`,
      movements: movements,
      userId: user.id,
      userRoleId: user.role_id || 1, // Bypass jika role admin
    });

    await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.SHIPPED);
  });

  signals.refreshRequests();

  notificationService
    .notifyUsers(
      [requestData.requester_id],
      "WMS",
      "Barang Telah Dikirim",
      `Barang untuk permintaan stok ${requestData.request_number} telah dikirim oleh gudang asal.`,
      { requestId, requestNumber: requestData.request_number },
      true,
    )
    .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));

  return { success: true, message: "Barang berhasil dikirim dan stok asal telah dipotong." };
};

/**
 * Reject Permintaan Stok
 */
export const rejectStockRequestService = async (requestId, _) => {
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    if (!request) throw new Error("Permintaan stok tidak ditemukan.");
    if (request.status !== STOCK_REQUEST_STATUS.PENDING)
      throw new Error("Hanya permintaan berstatus PENDING yang dapat ditolak.");

    requestData = request;
    await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.REJECTED);
  });

  signals.refreshRequests();

  notificationService
    .notifyUsers(
      [requestData.requester_id],
      "WMS",
      "Permintaan Stok Ditolak",
      `Permintaan stok ${requestData.request_number} telah ditolak.`,
      { requestId, requestNumber: requestData.request_number },
      true,
    )
    .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));

  return { success: true, message: "Permintaan stok telah ditolak." };
};

/**
 * Complete Permintaan Stok (Oleh Pihak Penerima)
 * Ini akan mentrigger penambahan stok (TRANSFER_IN).
 */
export const completeStockRequestService = async (requestId, receivedItems, user) => {
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    if (!request) throw new Error("Permintaan stok tidak ditemukan.");
    if (request.status !== STOCK_REQUEST_STATUS.SHIPPED)
      throw new Error("Hanya permintaan berstatus SHIPPED yang dapat diselesaikan.");

    requestData = request;

    // Update received_quantity
    const movements = [];
    for (const reqItem of request.items) {
      const match = receivedItems
        ? receivedItems.find((r) => r.productId === reqItem.product_id)
        : null;
      const rQty = match ? match.receivedQuantity : reqItem.quantity;

      await stockRequestRepo.updateRequestItemReceived(connection, reqItem.id, rQty);

      if (request.type === STOCK_REQUEST_TYPE.STOCK_OPNAME) {
        throw new Error("Permintaan Stock Opname tidak memerlukan konfirmasi penerimaan.");
      } else {
        if (rQty > 0) {
          movements.push({
            sku: reqItem.sku,
            quantity: rQty,
            fromLocationId: null,
            toLocationId: request.to_location_id,
            notes: `Penerimaan Permintaan Stok ${request.request_number}`,
          });
        }
      }
    }

    // Trigger penambahan stok (TRANSFER_IN)
    if (movements.length > 0) {
      await processBatchMovementsService({
        type: "TRANSFER_IN",
        fromLocationId: null,
        toLocationId: request.to_location_id,
        notes: `Penyelesaian Permintaan Stok ${request.request_number}`,
        movements: movements,
        userId: user.id,
        userRoleId: 1, // Bypass pengecekan lokasi karena ini sudah di-approve
      });
    }

    await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.COMPLETED);
  });

  signals.refreshRequests();

  notificationService
    .notifyUsers(
      [requestData.requester_id],
      "WMS",
      "Permintaan Stok Selesai",
      `Permintaan stok ${requestData.request_number} telah selesai dan stok berhasil ditransfer.`,
      { requestId, requestNumber: requestData.request_number },
      true,
    )
    .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));

  return { success: true, message: "Permintaan stok selesai dan stok telah ditransfer." };
};

/**
 * Bulk Action untuk Permintaan Stok
 * Mendukung aksi APPROVE dan REJECT secara massal.
 */
export const bulkActionStockRequestService = async (requestIds, action, user) => {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Tidak ada ID permintaan yang dipilih.");
  }

  const results = {
    successCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const id of requestIds) {
    try {
      if (action === "APPROVE") {
        await approveStockRequestService(id, user);
      } else if (action === "REJECT") {
        await rejectStockRequestService(id, user);
      } else {
        throw new Error(`Aksi ${action} tidak didukung secara massal.`);
      }

      results.successCount++;
      results.details.push({ id, status: "success" });
    } catch (err) {
      results.failedCount++;
      results.details.push({ id, status: "failed", reason: err.message });
    }
  }

  return {
    success: true,
    message: `Memproses ${requestIds.length} permintaan. Berhasil: ${results.successCount}, Gagal: ${results.failedCount}.`,
    data: results,
  };
};
