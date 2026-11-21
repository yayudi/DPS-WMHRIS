// backend/tests/services/stockRequestService.test.js
import { describe, test, expect, jest, beforeEach } from "@jest/globals";

const mockRepo = {
  createStockRequest: jest.fn(),
  getStockRequests: jest.fn(),
  getStockRequestById: jest.fn(),
  updateRequestItemReceived: jest.fn(),
  updateStockRequestStatus: jest.fn(),
};

const mockStockService = {
  processBatchMovementsService: jest.fn().mockResolvedValue({ success: true }),
  processBatchOpnameService: jest.fn().mockResolvedValue({ success: true }),
};

const mockNotificationService = {
  notifyUsersByPermission: jest.fn().mockResolvedValue(true),
  notifyUsers: jest.fn().mockResolvedValue(true),
};

const mockSignals = {
  refreshRequests: jest.fn(),
  refreshStock: jest.fn(),
};

const mockConnection = {
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
};

const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConnection),
};

await jest.unstable_mockModule("../../config/db.js", () => ({ default: mockDb }));
await jest.unstable_mockModule("../../repositories/stockRequestRepository.js", () => mockRepo);
await jest.unstable_mockModule("../../services/stockService.js", () => mockStockService);
await jest.unstable_mockModule("../../services/notificationService.js", () => mockNotificationService);
await jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: mockSignals,
}));

import {
  STOCK_MOVEMENT_TYPE,
  STOCK_REQUEST_STATUS,
  STOCK_REQUEST_TYPE,
} from "../../config/wmsConstants.js";
const { default: AppError } = await import("../../utils/AppError.js");

const {
  createStockRequestService,
  getStockRequestsService,
  approveStockRequestService,
  dispatchStockRequestService,
  rejectStockRequestService,
  completeStockRequestService,
  bulkActionStockRequestService,
} = await import("../../services/stockRequestService.js");

describe("stockRequestService with Transaction Wrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getConnection.mockResolvedValue(mockConnection);
  });

  describe("createStockRequestService", () => {
    test("harus melempar 400 AppError jika transfer tidak memiliki lokasi asal/tujuan tanpa acquire DB connection", async () => {
      const err = await createStockRequestService(
        { type: "TRANSFER", items: [{ sku: "A", quantity: 1 }] },
        1,
      ).catch((e) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe("VALIDATION_ERROR");
      expect(err.message).toBe("Lokasi asal dan tujuan harus diisi untuk transfer.");
      expect(mockDb.getConnection).not.toHaveBeenCalled();
    });

    test("harus melempar 400 AppError jika lokasi asal sama dengan tujuan atau opname tanpa lokasi", async () => {
      await expect(
        createStockRequestService(
          { type: "TRANSFER", fromLocationId: 1, toLocationId: 1, items: [{ sku: "A", quantity: 1 }] },
          1,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Lokasi asal dan tujuan tidak boleh sama.",
      });

      await expect(
        createStockRequestService(
          { type: STOCK_REQUEST_TYPE.STOCK_OPNAME, items: [{ sku: "A", quantity: 1 }] },
          1,
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Lokasi opname harus diisi.",
      });
    });

    test("harus melempar 400 AppError jika items kosong", async () => {
      await expect(
        createStockRequestService(
          { type: "TRANSFER", fromLocationId: 1, toLocationId: 2, items: [] },
          1
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Minimal harus ada satu produk yang diminta.",
      });
    });

    test("harus berhasil membuat request dalam transaksi", async () => {
      mockRepo.createStockRequest.mockResolvedValue(42);

      const result = await createStockRequestService(
        {
          type: "TRANSFER",
          fromLocationId: 1,
          toLocationId: 2,
          items: [{ sku: "ABC", quantity: 5 }],
        },
        99
      );

      expect(result).toEqual({
        success: true,
        message: "Permintaan stok berhasil dibuat.",
        requestId: 42,
      });
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshRequests).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.notifyUsersByPermission).toHaveBeenCalled();
    });
  });

  describe("getStockRequestsService", () => {
    test("harus mengambil daftar request via withConnection", async () => {
      mockRepo.getStockRequests.mockResolvedValue({
        data: [{ id: 1 }],
        pagination: { total: 1 },
      });

      const res = await getStockRequestsService({ status: "PENDING" });
      expect(res.data).toEqual([{ id: 1 }]);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("approveStockRequestService", () => {
    test("harus melempar 404 jika request tidak ada dan 400 jika status bukan PENDING", async () => {
      mockRepo.getStockRequestById.mockResolvedValueOnce(null);
      await expect(approveStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "NOT_FOUND",
        message: "Permintaan stok tidak ditemukan.",
      });

      mockRepo.getStockRequestById.mockResolvedValueOnce({
        id: 10,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.APPROVED,
      });
      await expect(approveStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Hanya permintaan berstatus PENDING yang dapat disetujui.",
      });
    });

    test("harus menolak self-approval dengan 403 FORBIDDEN AppError", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 10,
        requester_id: 5,
        status: "PENDING",
      });

      const err = await approveStockRequestService(10, { id: 5 }).catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.errorCode).toBe("FORBIDDEN");
      expect(err.message).toBe("Anda tidak dapat menyetujui permintaan Anda sendiri.");
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test("harus sukses menyetujui transfer standar dan commit transaksi", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 10,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.PENDING,
        type: STOCK_REQUEST_TYPE.TRANSFER,
        request_number: "REQ-001",
      });

      const res = await approveStockRequestService(10, { id: 99 });
      expect(res.success).toBe(true);
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 10, STOCK_REQUEST_STATUS.APPROVED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshRequests).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshStock).not.toHaveBeenCalled();
    });

    test("harus sukses menyetujui STOCK_OPNAME dengan meneruskan connection dan memicu refreshStock pasca-commit", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 11,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.PENDING,
        type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
        to_location_id: 7,
        request_number: "OPN-001",
        items: [{ id: 201, sku: "SKU-A", quantity: 15 }],
      });

      const res = await approveStockRequestService(11, { id: 99, role_id: 2 });
      expect(res).toEqual({
        success: true,
        message: "Permintaan stok opname disetujui dan stok disesuaikan.",
      });
      expect(mockStockService.processBatchOpnameService).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 99,
          userRoleId: 2,
          movements: [
            {
              sku: "SKU-A",
              quantity: 15,
              toLocationId: 7,
              notes: "Stock Request Opname OPN-001",
            },
          ],
        }),
        mockConnection,
      );
      expect(mockRepo.updateRequestItemReceived).toHaveBeenCalledWith(mockConnection, 201, 15);
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 11, STOCK_REQUEST_STATUS.COMPLETED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignals.refreshStock.mock.invocationCallOrder[0],
      );
    });
  });

  describe("dispatchStockRequestService", () => {
    test("harus melempar 404/400 AppError untuk request invalid atau tipe STOCK_OPNAME", async () => {
      mockRepo.getStockRequestById.mockResolvedValueOnce(null);
      await expect(dispatchStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "NOT_FOUND",
      });

      mockRepo.getStockRequestById.mockResolvedValueOnce({
        id: 10,
        status: STOCK_REQUEST_STATUS.PENDING,
      });
      await expect(dispatchStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Hanya permintaan berstatus APPROVED yang dapat dikirim.",
      });

      mockRepo.getStockRequestById.mockResolvedValueOnce({
        id: 10,
        status: STOCK_REQUEST_STATUS.APPROVED,
        type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
      });
      await expect(dispatchStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Permintaan Stock Opname tidak memerlukan pengiriman.",
      });
    });

    test("harus sukses dispatch dengan existingConnection dan memicu refreshStock pasca-commit", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 10,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.APPROVED,
        type: STOCK_REQUEST_TYPE.TRANSFER,
        from_location_id: 1,
        request_number: "REQ-001",
        items: [{ sku: "A", quantity: 2 }],
      });

      const res = await dispatchStockRequestService(10, { id: 99, role_id: 1 });
      expect(res.success).toBe(true);
      expect(mockStockService.processBatchMovementsService).toHaveBeenCalledWith(
        expect.objectContaining({
          type: STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
          fromLocationId: 1,
        }),
        mockConnection,
      );
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 10, STOCK_REQUEST_STATUS.SHIPPED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshRequests).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignals.refreshStock.mock.invocationCallOrder[0],
      );
    });
  });

  describe("rejectStockRequestService", () => {
    test("harus melempar 404/400 AppError jika request tidak ada atau status bukan PENDING", async () => {
      mockRepo.getStockRequestById.mockResolvedValueOnce(null);
      await expect(rejectStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "NOT_FOUND",
      });

      mockRepo.getStockRequestById.mockResolvedValueOnce({
        id: 10,
        status: STOCK_REQUEST_STATUS.SHIPPED,
      });
      await expect(rejectStockRequestService(10, { id: 99 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Hanya permintaan berstatus PENDING yang dapat ditolak.",
      });
    });

    test("harus sukses reject dan ubah status ke REJECTED", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 10,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.PENDING,
        request_number: "REQ-001",
      });

      const res = await rejectStockRequestService(10, { id: 99 });
      expect(res.success).toBe(true);
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 10, STOCK_REQUEST_STATUS.REJECTED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("completeStockRequestService", () => {
    test("harus melempar 404/400 AppError untuk request invalid atau tipe STOCK_OPNAME", async () => {
      mockRepo.getStockRequestById.mockResolvedValueOnce(null);
      await expect(completeStockRequestService(10, [], { id: 5 })).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "NOT_FOUND",
      });

      mockRepo.getStockRequestById.mockResolvedValueOnce({
        id: 10,
        status: STOCK_REQUEST_STATUS.APPROVED,
      });
      await expect(completeStockRequestService(10, [], { id: 5 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Hanya permintaan berstatus SHIPPED yang dapat diselesaikan.",
      });

      mockRepo.getStockRequestById.mockResolvedValueOnce({
        id: 10,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.SHIPPED,
        type: STOCK_REQUEST_TYPE.STOCK_OPNAME,
        items: [{ id: 101, sku: "A", quantity: 2, product_id: 1 }],
      });
      await expect(completeStockRequestService(10, [], { id: 5 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Permintaan Stock Opname tidak memerlukan konfirmasi penerimaan.",
      });
    });

    test("harus sukses menyelesaikan penerimaan stok dengan existingConnection dan memicu refreshStock pasca-commit", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 10,
        requester_id: 5,
        status: STOCK_REQUEST_STATUS.SHIPPED,
        type: STOCK_REQUEST_TYPE.TRANSFER,
        to_location_id: 2,
        request_number: "REQ-001",
        items: [{ id: 101, sku: "A", quantity: 2, product_id: 1 }],
      });

      const res = await completeStockRequestService(10, [{ productId: 1, receivedQuantity: 2 }], {
        id: 5,
      });
      expect(res.success).toBe(true);
      expect(mockRepo.updateRequestItemReceived).toHaveBeenCalledWith(mockConnection, 101, 2);
      expect(mockStockService.processBatchMovementsService).toHaveBeenCalledWith(
        expect.objectContaining({
          type: STOCK_MOVEMENT_TYPE.TRANSFER_IN,
          toLocationId: 2,
        }),
        mockConnection,
      );
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 10, STOCK_REQUEST_STATUS.COMPLETED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        mockSignals.refreshStock.mock.invocationCallOrder[0],
      );
    });
  });

  describe("bulkActionStockRequestService", () => {
    test("harus melempar 400 AppError jika requestIds kosong dan mencatat aksi tidak valid di details", async () => {
      await expect(bulkActionStockRequestService([], "APPROVE", { id: 99 })).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Tidak ada ID permintaan yang dipilih.",
      });

      const invalidRes = await bulkActionStockRequestService([1], "DELETE", { id: 99 });
      expect(invalidRes.data).toEqual({
        successCount: 0,
        failedCount: 1,
        details: [{ id: 1, status: "failed", reason: "Aksi DELETE tidak didukung secara massal." }],
      });
    });

    test("harus menjalankan aksi bulk dengan benar", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 1,
        requester_id: 5,
        status: "PENDING",
        request_number: "REQ-001",
      });

      const res = await bulkActionStockRequestService([1], "REJECT", { id: 99 });
      expect(res.success).toBe(true);
      expect(res.data.successCount).toBe(1);
    });
  });
});
