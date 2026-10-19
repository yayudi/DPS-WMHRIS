import { jest } from "@jest/globals";

const mockConn = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConn),
};

const mockInvestigationRepo = {
  countDuplicateGroups: jest.fn(),
  getDuplicateGroups: jest.fn(),
  findPickingListDetailsByInvoices: jest.fn(),
};

const mockLocationRepo = {
  incrementStock: jest.fn(),
  deductStock: jest.fn(),
};

const mockStockRepo = {
  createLog: jest.fn(),
};

const mockSignals = {
  transactionReverted: jest.fn(),
  refreshStock: jest.fn(),
};

await jest.unstable_mockModule("../../config/db.js", () => ({
  default: mockDb,
}));

await jest.unstable_mockModule(
  "../../repositories/investigationRepository.js",
  () => mockInvestigationRepo,
);

await jest.unstable_mockModule(
  "../../repositories/locationRepository.js",
  () => mockLocationRepo,
);

await jest.unstable_mockModule(
  "../../repositories/stockMovementRepository.js",
  () => mockStockRepo,
);

await jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: mockSignals,
}));

const { getDuplicateTransactionsService, revertTransactionService } =
  await import("../../services/investigationService.js");

describe("investigationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConn.query.mockReset();
    mockInvestigationRepo.findPickingListDetailsByInvoices.mockResolvedValue([]);
  });

  describe("getDuplicateTransactionsService", () => {
    test("throws AppError if startDate > endDate", async () => {
      await expect(
        getDuplicateTransactionsService({ startDate: "2026-05-10", endDate: "2026-05-01" }),
      ).rejects.toThrow("Tanggal mulai tidak boleh lebih besar dari tanggal akhir.");
    });

    test("fetches duplicate groups and returns paginated meta", async () => {
      mockInvestigationRepo.countDuplicateGroups.mockResolvedValueOnce(2);
      mockInvestigationRepo.getDuplicateGroups.mockResolvedValueOnce([
        {
          product_id: 1,
          quantity: 2,
          created_minute: "2026-05-01 10:00",
          user_id: 5,
          user_name: "admin",
          product_name: "Test Product",
          sku: "TP-001",
          from_location: "LOC-A",
          to_location: "LOC-B",
          notes: "Sale Ref: INV-001 (Item 10)",
        },
      ]);
      mockInvestigationRepo.findPickingListDetailsByInvoices.mockResolvedValueOnce([
        {
          invoice_id: "INV-001",
          item_id: 10,
          customer_name: "Customer A",
          shop_name: "Shop A",
          status: "PACKED",
        },
      ]);

      const result = await getDuplicateTransactionsService({
        startDate: "2026-05-01",
        endDate: "2026-05-02",
      });

      expect(result.data).toBeDefined();
      expect(result.meta.totalGroups).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(mockConn.release).toHaveBeenCalled();
    });
  });

  describe("revertTransactionService", () => {
    test("throws 404 if transaction not found", async () => {
      mockConn.query.mockResolvedValueOnce([[]]);

      await expect(revertTransactionService(999, 1)).rejects.toThrow("Transaksi tidak ditemukan");
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });

    test("throws 400 if transaction already reverted", async () => {
      mockConn.query
        .mockResolvedValueOnce([[{ id: 10, notes: "Order #1" }]])
        .mockResolvedValueOnce([[{ id: 11 }]]);

      await expect(revertTransactionService(10, 1)).rejects.toThrow(
        "Transaksi ini sudah di-revert sebelumnya",
      );
      expect(mockConn.rollback).toHaveBeenCalled();
    });

    test("successfully reverts transaction, restores physical stock, creates log and commits", async () => {
      const originalTrx = {
        id: 25,
        product_id: 101,
        quantity: 5,
        from_location_id: 2,
        to_location_id: 3,
        notes: "Transfer stock",
      };

      mockConn.query
        .mockResolvedValueOnce([[originalTrx]]) // 1. Original trx
        .mockResolvedValueOnce([[]]) // 2. No existing revert
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // 5. Update notes

      mockLocationRepo.incrementStock.mockResolvedValueOnce(true);
      mockLocationRepo.deductStock.mockResolvedValueOnce(true);
      mockStockRepo.createLog.mockResolvedValueOnce(true);

      const result = await revertTransactionService(25, 9);

      expect(mockLocationRepo.incrementStock).toHaveBeenCalledWith(mockConn, 101, 2, 5);
      expect(mockLocationRepo.deductStock).toHaveBeenCalledWith(mockConn, 101, 3, 5);
      expect(mockStockRepo.createLog).toHaveBeenCalledWith(mockConn, {
        productId: 101,
        quantity: 5,
        toLocationId: 2,
        fromLocationId: 3,
        type: "REVERSAL",
        userId: 9,
        notes: "Reversal of Trx #25 - Transfer stock",
      });
      expect(mockConn.commit).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
      expect(mockSignals.transactionReverted).toHaveBeenCalled();
      expect(mockSignals.refreshStock).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
