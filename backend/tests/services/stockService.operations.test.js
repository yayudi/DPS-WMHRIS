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

jest.unstable_mockModule("../../repositories/productRepository.js", () => ({
  getProductMapWithComponents: jest.fn(),
  getProductById: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/locationRepository.js", () => ({
  getStockAtLocation: jest.fn(),
  deductStock: jest.fn(),
  incrementStock: jest.fn(),
  upsertStock: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/stockMovementRepository.js", () => ({
  createLog: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/userRepository.js", () => ({
  hasLocationAccess: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/pickingRepository.js", () => ({
  getReturnedItemForValidation: jest.fn(),
  updateItemStatus: jest.fn(),
}));

jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: {
    refreshStock: jest.fn(),
    refreshPicking: jest.fn(),
  },
  sendFirebaseSignal: jest.fn(),
}));

jest.unstable_mockModule("../../services/notificationService.js", () => ({
  notifyUsersByPermission: jest.fn(() => Promise.resolve()),
}));

const stockService = await import("../../services/stockService.js");
const productRepo = await import("../../repositories/productRepository.js");
const locationRepo = await import("../../repositories/locationRepository.js");
const stockRepo = await import("../../repositories/stockMovementRepository.js");
const userRepo = await import("../../repositories/userRepository.js");
const pickingRepo = await import("../../repositories/pickingRepository.js");
const { signals } = await import("../../services/firebaseSignalService.js");

describe("stockService Transactional Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("transferStockService", () => {
    test("Success: Transfer stock between locations", async () => {
      productRepo.getProductById.mockResolvedValue({ id: 10, sku: "ITEM-1", name: "Item One" });

      const productMap = new Map();
      productMap.set("ITEM-1", { id: 10, sku: "ITEM-1", name: "Item One", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(20);

      const res = await stockService.transferStockService({
        productId: 10,
        fromLocationId: 1,
        toLocationId: 2,
        quantity: 5,
        userId: 99,
        notes: "Test transfer",
      });

      expect(res).toEqual({ success: true, message: "Transfer berhasil." });
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 10, 1, 5);
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 10, 2, 5);
      expect(stockRepo.createLog).toHaveBeenCalledWith(mockConnection, expect.objectContaining({
        productId: 10,
        quantity: 5,
        type: "TRANSFER",
      }));
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(signals.refreshStock).toHaveBeenCalled();
    });

    test("Fail: Insufficient stock triggers rollback", async () => {
      productRepo.getProductById.mockResolvedValue({ id: 10, sku: "ITEM-1", name: "Item One" });

      const productMap = new Map();
      productMap.set("ITEM-1", { id: 10, sku: "ITEM-1", name: "Item One", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(2); // Only 2 in stock

      await expect(
        stockService.transferStockService({
          productId: 10,
          fromLocationId: 1,
          toLocationId: 2,
          quantity: 5, // Requires 5
          userId: 99,
          notes: "Test transfer fail",
        })
      ).rejects.toThrow("Stok tidak cukup untuk ITEM-1. Butuh: 5, Ada: 2.");

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe("adjustStockService", () => {
    test("Success: Increase stock via adjustment", async () => {
      productRepo.getProductById.mockResolvedValue({ id: 25, sku: "ITEM-ADJ" });

      const productMap = new Map();
      productMap.set("ITEM-ADJ", { id: 25, sku: "ITEM-ADJ", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      const res = await stockService.adjustStockService({
        productId: 25,
        locationId: 3,
        quantity: 10,
        userId: 99,
        notes: "Restock adjustment",
      });

      expect(res).toEqual({ success: true, message: "Penyesuaian stok berhasil." });
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 25, 3, 10);
      expect(stockRepo.createLog).toHaveBeenCalledWith(mockConnection, expect.objectContaining({
        productId: 25,
        quantity: 10,
        type: "ADJUSTMENT",
      }));
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(signals.refreshStock).toHaveBeenCalled();
    });
  });

  describe("processBatchOpnameService", () => {
    test("Success: Opname override calculates diff correctly", async () => {
      const productMap = new Map();
      productMap.set("PHYSICAL-1", { id: 40, sku: "PHYSICAL-1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(8); // Current is 8

      const res = await stockService.processBatchOpnameService({
        movements: [{ sku: "PHYSICAL-1", quantity: 10, toLocationId: 5, notes: "Stock count" }],
        userId: 99,
        userRoleId: 1, // Admin
      });

      expect(res).toEqual({ success: true, count: 1 });
      expect(locationRepo.upsertStock).toHaveBeenCalledWith(mockConnection, 40, 5, 10);
      expect(stockRepo.createLog).toHaveBeenCalledWith(mockConnection, expect.objectContaining({
        productId: 40,
        quantity: 2, // diff |10 - 8| = 2
        type: "OPNAME",
      }));
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(signals.refreshStock).toHaveBeenCalled();
    });

    test("Permission Check: Non-admin denied if no location access", async () => {
      userRepo.hasLocationAccess.mockResolvedValue(false);

      const productMap = new Map();
      productMap.set("PHYSICAL-1", { id: 40, sku: "PHYSICAL-1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      await expect(
        stockService.processBatchOpnameService({
          movements: [{ sku: "PHYSICAL-1", quantity: 10, toLocationId: 5 }],
          userId: 99,
          userRoleId: 2, // Non-admin
        })
      ).rejects.toThrow("Akses ditolak untuk mencatat stok pada lokasi SKU 'PHYSICAL-1'.");
    });
  });

  describe("validateReturnService", () => {
    test("Success: Validate return item and complete status", async () => {
      pickingRepo.getReturnedItemForValidation.mockResolvedValue({ product_id: 50, quantity: 3 });
      pickingRepo.updateItemStatus.mockResolvedValue([{ affectedRows: 1 }]);

      const res = await stockService.validateReturnService({
        pickingListItemId: 777,
        returnToLocationId: 4,
        userId: 99,
      });

      expect(res).toEqual({
        success: true,
        message: "Item (ID: 777) berhasil divalidasi.",
      });
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 50, 4, 3);
      expect(stockRepo.createLog).toHaveBeenCalledWith(mockConnection, expect.objectContaining({
        productId: 50,
        quantity: 3,
        type: "RETURN",
      }));
      expect(pickingRepo.updateItemStatus).toHaveBeenCalledWith(mockConnection, 777, "COMPLETED_RETURN");
      expect(signals.refreshPicking).toHaveBeenCalled();
      expect(signals.refreshStock).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    test("Support: uses existingConnection without initiating new transaction", async () => {
      const nestedMockConn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      pickingRepo.getReturnedItemForValidation.mockResolvedValue({ product_id: 50, quantity: 1 });
      pickingRepo.updateItemStatus.mockResolvedValue([{ affectedRows: 1 }]);

      await stockService.validateReturnService(
        { pickingListItemId: 888, returnToLocationId: 4, userId: 99 },
        nestedMockConn,
      );

      expect(nestedMockConn.beginTransaction).not.toHaveBeenCalled();
      expect(nestedMockConn.commit).not.toHaveBeenCalled();
      expect(nestedMockConn.release).not.toHaveBeenCalled();
    });
  });

});
