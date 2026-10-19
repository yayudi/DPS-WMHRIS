import { jest } from "@jest/globals";

const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(),
};

jest.unstable_mockModule("../../config/db.js", () => ({
  default: {
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
  },
}));

jest.unstable_mockModule("../../repositories/returnRepository.js", () => ({
  getPendingReturns: jest.fn(),
  getReturnHistory: jest.fn(),
  getItemById: jest.fn(),
  completeReturnItem: jest.fn(),
  decreaseItemQty: jest.fn(),
  createSplitReturnItem: jest.fn(),
  createManualReturn: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/locationRepository.js", () => ({
  incrementStock: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/stockMovementRepository.js", () => ({
  createLog: jest.fn(),
}));

jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: {
    refreshStock: jest.fn(),
  },
}));

// Dynamic import module under test
const returnRepo = await import("../../repositories/returnRepository.js");
const locationRepo = await import("../../repositories/locationRepository.js");
const stockRepo = await import("../../repositories/stockMovementRepository.js");
const { signals } = await import("../../services/firebaseSignalService.js");
const returnService = await import("../../services/returnService.js");

describe("returnService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.beginTransaction.mockResolvedValue();
    mockConnection.commit.mockResolvedValue();
    mockConnection.rollback.mockResolvedValue();
  });

  describe("getPendingReturnsService", () => {
    it("returns rows and calculated pagination", async () => {
      const mockRows = [{ id: 1, original_sku: "SKU-A", quantity: 5 }];
      returnRepo.getPendingReturns.mockResolvedValue({ rows: mockRows, total: 25 });

      const result = await returnService.getPendingReturnsService({ page: 2, limit: 10 });

      expect(returnRepo.getPendingReturns).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({ limit: 10, offset: 10 }),
      );
      expect(result.rows).toEqual(mockRows);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe("getReturnHistoryService", () => {
    it("returns history rows and pagination", async () => {
      const mockRows = [{ id: 10, product_name: "Produk B", condition: "GOOD" }];
      returnRepo.getReturnHistory.mockResolvedValue({ rows: mockRows, total: 12 });

      const result = await returnService.getReturnHistoryService({
        page: 1,
        limit: 10,
        condition: "GOOD",
      });

      expect(returnRepo.getReturnHistory).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({ limit: 10, offset: 0, condition: "GOOD" }),
      );
      expect(result.rows).toEqual(mockRows);
      expect(result.pagination.totalPages).toBe(2);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe("approveReturnService", () => {
    it("throws VALIDATION_ERROR if itemId or locationId is missing", async () => {
      await expect(returnService.approveReturnService({ itemId: null, locationId: 1 })).rejects.toThrow(
        "Item ID wajib diisi.",
      );

      await expect(returnService.approveReturnService({ itemId: 1, locationId: null })).rejects.toThrow(
        "Lokasi tujuan restock wajib diisi.",
      );
    });

    it("throws NOT_FOUND if item does not exist", async () => {
      returnRepo.getItemById.mockResolvedValue(null);

      await expect(
        returnService.approveReturnService({ itemId: 99, locationId: 2, qtyAccepted: 1 }),
      ).rejects.toThrow("Item picking tidak ditemukan.");

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it("throws INVALID_STATUS if item status is not RETURNED", async () => {
      returnRepo.getItemById.mockResolvedValue({ id: 1, status: "PICKED", quantity: 5 });

      await expect(
        returnService.approveReturnService({ itemId: 1, locationId: 2, qtyAccepted: 2 }),
      ).rejects.toThrow("Item status bukan RETURNED");

      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it("throws INVALID_QUANTITY if qtyAccepted is invalid or exceeds item quantity", async () => {
      returnRepo.getItemById.mockResolvedValue({ id: 1, status: "RETURNED", quantity: 5 });

      await expect(
        returnService.approveReturnService({ itemId: 1, locationId: 2, qtyAccepted: 0 }),
      ).rejects.toThrow("Jumlah diterima (0) tidak valid.");

      await expect(
        returnService.approveReturnService({ itemId: 1, locationId: 2, qtyAccepted: 10 }),
      ).rejects.toThrow("Jumlah diterima (10) tidak valid.");

      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    it("handles Full Return successfully and increments physical stock", async () => {
      const mockItem = { id: 1, product_id: 101, status: "RETURNED", quantity: 5 };
      returnRepo.getItemById.mockResolvedValue(mockItem);
      returnRepo.completeReturnItem.mockResolvedValue();
      locationRepo.incrementStock.mockResolvedValue();
      stockRepo.createLog.mockResolvedValue();

      const result = await returnService.approveReturnService(
        {
          itemId: 1,
          qtyAccepted: 5,
          locationId: 10,
          condition: "GOOD",
          notes: "Kardus utuh",
        },
        { userId: 3 },
      );

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(returnRepo.completeReturnItem).toHaveBeenCalledWith(
        mockConnection,
        1,
        expect.objectContaining({ condition: "GOOD", notes: "Kardus utuh", locationId: 10 }),
      );
      expect(returnRepo.decreaseItemQty).not.toHaveBeenCalled();
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 101, 10, 5);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId: 101,
          quantity: 5,
          toLocationId: 10,
          type: "RETURN_INBOUND",
          userId: 3,
        }),
      );
      expect(signals.refreshStock).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("handles Partial Return successfully via item splitting", async () => {
      const mockItem = { id: 2, product_id: 202, status: "RETURNED", quantity: 5 };
      returnRepo.getItemById.mockResolvedValue(mockItem);
      returnRepo.decreaseItemQty.mockResolvedValue();
      returnRepo.createSplitReturnItem.mockResolvedValue();
      locationRepo.incrementStock.mockResolvedValue();
      stockRepo.createLog.mockResolvedValue();

      const result = await returnService.approveReturnService(
        {
          itemId: 2,
          qtyAccepted: 3,
          locationId: 15,
          condition: "BAD",
          notes: "Pecah 3",
        },
        { userId: 4 },
      );

      expect(returnRepo.decreaseItemQty).toHaveBeenCalledWith(mockConnection, 2, 3);
      expect(returnRepo.createSplitReturnItem).toHaveBeenCalledWith(
        mockConnection,
        mockItem,
        expect.objectContaining({ qtyReturn: 3, condition: "BAD", locationId: 15 }),
      );
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 202, 15, 3);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({ productId: 202, quantity: 3, toLocationId: 15 }),
      );
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("createManualReturnService", () => {
    it("throws VALIDATION_ERROR if productId or locationId is missing", async () => {
      await expect(
        returnService.createManualReturnService({ productId: null, locationId: 1, quantity: 5 }),
      ).rejects.toThrow("Produk dan lokasi tujuan wajib dipilih.");
    });

    it("throws INVALID_QUANTITY if quantity is not positive", async () => {
      await expect(
        returnService.createManualReturnService({ productId: 10, locationId: 1, quantity: 0 }),
      ).rejects.toThrow("Jumlah kuantitas harus berupa angka lebih dari 0.");
    });

    it("creates manual return, increments stock, logs movement and commits", async () => {
      returnRepo.createManualReturn.mockResolvedValue();
      locationRepo.incrementStock.mockResolvedValue();
      stockRepo.createLog.mockResolvedValue();

      const result = await returnService.createManualReturnService(
        {
          productId: 55,
          quantity: 4,
          condition: "GOOD",
          locationId: 8,
          reference: "RESI-12345",
          notes: "Salah kirim",
        },
        { userId: 2 },
      );

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(returnRepo.createManualReturn).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          userId: 2,
          productId: 55,
          quantity: 4,
          condition: "GOOD",
          reference: "RESI-12345",
        }),
      );
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 55, 8, 4);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId: 55,
          quantity: 4,
          toLocationId: 8,
          type: "MANUAL_RETURN",
          userId: 2,
        }),
      );
      expect(signals.refreshStock).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("rolls back transaction on repository error", async () => {
      returnRepo.createManualReturn.mockRejectedValue(new Error("DB insertion failed"));

      await expect(
        returnService.createManualReturnService(
          { productId: 55, quantity: 4, condition: "GOOD", locationId: 8 },
          { userId: 1 },
        ),
      ).rejects.toThrow("DB insertion failed");

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });
});
