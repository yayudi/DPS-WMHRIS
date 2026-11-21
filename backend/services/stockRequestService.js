// backend/services/stockRequestService.js
import AppError from "../utils/AppError.js";
import Logger from "../utils/logger.js";
import { processBatchMovementsService, processBatchOpnameService } from "./stockService.js";
import { signals } from "./firebaseSignalService.js";
import * as stockRequestRepo from "../repositories/stockRequestRepository.js";
import * as notificationService from "./notificationService.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";
import {
  STOCK_MOVEMENT_TYPE,
  STOCK_REQUEST_STATUS,
  STOCK_REQUEST_TYPE,
} from "../config/wmsConstants.js";

/**
 * Memvalidasi keberadaan permintaan stok dan kesesuaian statusnya sebelum diproses.
 * @param {Object|null} request
 * @param {string} expectedStatus
 * @param {string} statusErrorMessage
 * @returns {void}
 * @throws {AppError}
 */
const assertRequestExistsAndStatus = (request, expectedStatus, statusErrorMessage) => {
  if (!request) {
    throw new AppError("Permintaan stok tidak ditemukan.", 404, "NOT_FOUND");
  }
  if (request.status !== expectedStatus) {
    throw new AppError(statusErrorMessage, 400, "VALIDATION_ERROR");
  }
};

/**
 * Mengirim notifikasi ke pembuat permintaan stok secara fire-and-forget.
 * @param {number|string} userId
 * @param {string} title
 * @param {string} message
 * @param {Object} payload
 * @returns {void}
 */
const notifyRequester = (userId, title, message, payload) => {
  notificationService
    .notifyUsers([userId], "WMS", title, message, payload, true)
    .catch((e) => Logger.error("Failed to send notification", e, "STOCK_REQUEST_SERVICE"));
};

/**
 * Membuat permintaan stok (bulk)
 * @param {Object} payload
 * @param {number|string} userId
 * @returns {Promise<{ success: boolean, message: string, requestId: number|string }>}
 * @throws {AppError}
 */
export const createStockRequestService = async (payload, userId) => {
  const fullPayload = { ...payload, requesterId: userId };
  const type = payload.type || STOCK_REQUEST_TYPE.TRANSFER;

  // Validasi basic
  if (type === STOCK_REQUEST_TYPE.TRANSFER) {
    if (!payload.fromLocationId || !payload.toLocationId) {
      throw new AppError("Lokasi asal dan tujuan harus diisi untuk transfer.", 400, "VALIDATION_ERROR");
    }
    if (payload.fromLocationId === payload.toLocationId) {
      throw new AppError("Lokasi asal dan tujuan tidak boleh sama.", 400, "VALIDATION_ERROR");
    }
  } else if (type === STOCK_REQUEST_TYPE.STOCK_OPNAME) {
    if (!payload.toLocationId) {
      throw new AppError("Lokasi opname harus diisi.", 400, "VALIDATION_ERROR");
    }
  }

  if (!payload.items || payload.items.length === 0) {
    throw new AppError("Minimal harus ada satu produk yang diminta.", 400, "VALIDATION_ERROR");
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
 * @param {Object} filters
 * @returns {Promise<{ success: boolean, data: Array<Object>, pagination: Object }>}
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
 * @param {number|string} requestId
 * @param {Object} user
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const approveStockRequestService = async (requestId, user) => {
  let isOpname = false;
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    assertRequestExistsAndStatus(
      request,
      STOCK_REQUEST_STATUS.PENDING,
      "Hanya permintaan berstatus PENDING yang dapat disetujui.",
    );

    // Cegah self-approval
    if (request.requester_id === user.id) {
      throw new AppError("Anda tidak dapat menyetujui permintaan Anda sendiri.", 403, "FORBIDDEN");
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

      await processBatchOpnameService(
        {
          movements,
          userId: user.id,
          userRoleId: user.role_id || 1,
        },
        connection,
      );

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
    signals.refreshStock();
    notifyRequester(
      requestData.requester_id,
      "Permintaan Opname Disetujui",
      `Permintaan stok opname ${requestData.request_number} telah disetujui dan stok disesuaikan.`,
      { requestId, requestNumber: requestData.request_number },
    );

    return { success: true, message: "Permintaan stok opname disetujui dan stok disesuaikan." };
  }

  notifyRequester(
    requestData.requester_id,
    "Permintaan Stok Disetujui",
    `Permintaan stok ${requestData.request_number} telah disetujui. Silakan lakukan konfirmasi penerimaan.`,
    { requestId, requestNumber: requestData.request_number },
  );

  return { success: true, message: "Permintaan stok berhasil disetujui." };
};

/**
 * Dispatch Permintaan Stok (Oleh Pihak Pengirim)
 * Mengurangi stok dari gudang asal dan merubah status jadi SHIPPED
 * @param {number|string} requestId
 * @param {Object} user
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const dispatchStockRequestService = async (requestId, user) => {
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    assertRequestExistsAndStatus(
      request,
      STOCK_REQUEST_STATUS.APPROVED,
      "Hanya permintaan berstatus APPROVED yang dapat dikirim.",
    );
    if (request.type === STOCK_REQUEST_TYPE.STOCK_OPNAME) {
      throw new AppError("Permintaan Stock Opname tidak memerlukan pengiriman.", 400, "VALIDATION_ERROR");
    }

    requestData = request;

    // Deduct stock from sender (TRANSFER_OUT)
    const movements = request.items.map((reqItem) => ({
      sku: reqItem.sku,
      quantity: reqItem.quantity,
      fromLocationId: request.from_location_id,
      notes: `Pengiriman Permintaan Stok ${request.request_number}`,
    }));

    await processBatchMovementsService(
      {
        type: STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
        fromLocationId: request.from_location_id,
        toLocationId: null, // Hanya pengurangan stok
        notes: `Pengiriman Stok ${request.request_number}`,
        movements,
        userId: user.id,
        userRoleId: user.role_id || 1, // Bypass jika role admin
      },
      connection,
    );

    await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.SHIPPED);
  });

  signals.refreshRequests();
  signals.refreshStock();

  notifyRequester(
    requestData.requester_id,
    "Barang Telah Dikirim",
    `Barang untuk permintaan stok ${requestData.request_number} telah dikirim oleh gudang asal.`,
    { requestId, requestNumber: requestData.request_number },
  );

  return { success: true, message: "Barang berhasil dikirim dan stok asal telah dipotong." };
};

/**
 * Reject Permintaan Stok
 * @param {number|string} requestId
 * @param {Object} _
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const rejectStockRequestService = async (requestId, _) => {
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    assertRequestExistsAndStatus(
      request,
      STOCK_REQUEST_STATUS.PENDING,
      "Hanya permintaan berstatus PENDING yang dapat ditolak.",
    );

    requestData = request;
    await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.REJECTED);
  });

  signals.refreshRequests();

  notifyRequester(
    requestData.requester_id,
    "Permintaan Stok Ditolak",
    `Permintaan stok ${requestData.request_number} telah ditolak.`,
    { requestId, requestNumber: requestData.request_number },
  );

  return { success: true, message: "Permintaan stok telah ditolak." };
};

/**
 * Complete Permintaan Stok (Oleh Pihak Penerima)
 * Ini akan mentrigger penambahan stok (TRANSFER_IN).
 * @param {number|string} requestId
 * @param {Array<{ productId: number|string, receivedQuantity: number }>|null} receivedItems
 * @param {Object} user
 * @returns {Promise<{ success: boolean, message: string }>}
 * @throws {AppError}
 */
export const completeStockRequestService = async (requestId, receivedItems, user) => {
  let requestData = null;

  await withTransaction(async (connection) => {
    const request = await stockRequestRepo.getStockRequestById(connection, requestId);
    assertRequestExistsAndStatus(
      request,
      STOCK_REQUEST_STATUS.SHIPPED,
      "Hanya permintaan berstatus SHIPPED yang dapat diselesaikan.",
    );

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
        throw new AppError(
          "Permintaan Stock Opname tidak memerlukan konfirmasi penerimaan.",
          400,
          "VALIDATION_ERROR",
        );
      } else if (rQty > 0) {
        movements.push({
          sku: reqItem.sku,
          quantity: rQty,
          fromLocationId: null,
          toLocationId: request.to_location_id,
          notes: `Penerimaan Permintaan Stok ${request.request_number}`,
        });
      }
    }

    // Trigger penambahan stok (TRANSFER_IN)
    if (movements.length > 0) {
      await processBatchMovementsService(
        {
          type: STOCK_MOVEMENT_TYPE.TRANSFER_IN,
          fromLocationId: null,
          toLocationId: request.to_location_id,
          notes: `Penyelesaian Permintaan Stok ${request.request_number}`,
          movements,
          userId: user.id,
          userRoleId: 1, // Bypass pengecekan lokasi karena ini sudah di-approve
        },
        connection,
      );
    }

    await stockRequestRepo.updateStockRequestStatus(connection, requestId, STOCK_REQUEST_STATUS.COMPLETED);
  });

  signals.refreshRequests();
  signals.refreshStock();

  notifyRequester(
    requestData.requester_id,
    "Permintaan Stok Selesai",
    `Permintaan stok ${requestData.request_number} telah selesai dan stok berhasil ditransfer.`,
    { requestId, requestNumber: requestData.request_number },
  );

  return { success: true, message: "Permintaan stok selesai dan stok telah ditransfer." };
};

/**
 * Bulk Action untuk Permintaan Stok
 * Mendukung aksi APPROVE dan REJECT secara massal.
 * @param {Array<number|string>} requestIds
 * @param {string} action
 * @param {Object} user
 * @returns {Promise<{ success: boolean, message: string, data: Object }>}
 * @throws {AppError}
 */
export const bulkActionStockRequestService = async (requestIds, action, user) => {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new AppError("Tidak ada ID permintaan yang dipilih.", 400, "VALIDATION_ERROR");
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
        throw new AppError(`Aksi ${action} tidak didukung secara massal.`, 400, "VALIDATION_ERROR");
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
