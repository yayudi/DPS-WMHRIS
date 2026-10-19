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

import { STOCK_REQUEST_STATUS, STOCK_REQUEST_TYPE } from "../../config/wmsConstants.js";

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
    test("harus melempar error jika transfer tidak memiliki lokasi asal/tujuan tanpa acquire DB connection", async () => {
      await expect(
        createStockRequestService({ type: "TRANSFER", items: [{ sku: "A", quantity: 1 }] }, 1)
      ).rejects.toThrow("Lokasi asal dan tujuan harus diisi untuk transfer.");
      expect(mockDb.getConnection).not.toHaveBeenCalled();
    });

    test("harus melempar error jika items kosong", async () => {
      await expect(
        createStockRequestService(
          { type: "TRANSFER", fromLocationId: 1, toLocationId: 2, items: [] },
          1
        )
      ).rejects.toThrow("Minimal harus ada satu produk yang diminta.");
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
    test("harus menolak self-approval", async () => {
      mockRepo.getStockRequestById.mockResolvedValue({
        id: 10,
        requester_id: 5,
        status: "PENDING",
      });

      await expect(approveStockRequestService(10, { id: 5 })).rejects.toThrow(
        "Anda tidak dapat menyetujui permintaan Anda sendiri."
      );
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
    });
  });

  describe("dispatchStockRequestService", () => {
    test("harus sukses dispatch dan ubah status ke SHIPPED", async () => {
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
      expect(mockStockService.processBatchMovementsService).toHaveBeenCalled();
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 10, STOCK_REQUEST_STATUS.SHIPPED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshRequests).toHaveBeenCalledTimes(1);
    });
  });

  describe("rejectStockRequestService", () => {
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
    test("harus sukses menyelesaikan penerimaan stok dan commit", async () => {
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
      expect(mockStockService.processBatchMovementsService).toHaveBeenCalled();
      expect(mockRepo.updateStockRequestStatus).toHaveBeenCalledWith(mockConnection, 10, STOCK_REQUEST_STATUS.COMPLETED);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });
  });

  describe("bulkActionStockRequestService", () => {
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
