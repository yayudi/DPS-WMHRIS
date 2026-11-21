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
  getAllLocationCodes: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/stockMovementRepository.js", () => ({
  createLog: jest.fn(),
  getStockHistory: jest.fn(),
  getBatchLogs: jest.fn(),
  getMovementTypes: jest.fn(),
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
const { default: AppError } = await import("../../utils/AppError.js");
const { STOCK_MOVEMENT_TYPE } = await import("../../config/wmsConstants.js");
const productRepo = await import("../../repositories/productRepository.js");
const locationRepo = await import("../../repositories/locationRepository.js");
const stockRepo = await import("../../repositories/stockMovementRepository.js");
const userRepo = await import("../../repositories/userRepository.js");
const pickingRepo = await import("../../repositories/pickingRepository.js");
const { signals } = await import("../../services/firebaseSignalService.js");
const notificationService = await import("../../services/notificationService.js");

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
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalled();
      expect(signals.refreshStock).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyUsersByPermission).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshStock.mock.invocationCallOrder[0],
      );
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        notificationService.notifyUsersByPermission.mock.invocationCallOrder[0],
      );
    });

    test("Fail: Insufficient stock triggers rollback", async () => {
      productRepo.getProductById.mockResolvedValue({ id: 10, sku: "ITEM-1", name: "Item One" });

      const productMap = new Map();
      productMap.set("ITEM-1", { id: 10, sku: "ITEM-1", name: "Item One", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(2); // Only 2 in stock

      const err = await stockService
        .transferStockService({
          productId: 10,
          fromLocationId: 1,
          toLocationId: 2,
          quantity: 5, // Requires 5
          userId: 99,
          notes: "Test transfer fail",
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
      expect(err.errorCode).toBe("INSUFFICIENT_STOCK");
      expect(err.message).toBe("Stok tidak cukup untuk ITEM-1. Butuh: 5, Ada: 2.");

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
      expect(signals.refreshStock).not.toHaveBeenCalled();
      expect(notificationService.notifyUsersByPermission).not.toHaveBeenCalled();
    });

    test("Fail: Product not found throws 404 AppError", async () => {
      productRepo.getProductById.mockResolvedValue(null);

      await expect(
        stockService.transferStockService({
          productId: 999,
          fromLocationId: 1,
          toLocationId: 2,
          quantity: 1,
          userId: 99,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "NOT_FOUND",
        message: "Produk tidak ditemukan.",
      });
    });

    test("Support: skips signals and notifications when existingConnection is passed", async () => {
      const nestedMockConn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      productRepo.getProductById.mockResolvedValue({ id: 10, sku: "ITEM-1", name: "Item One" });
      const productMap = new Map();
      productMap.set("ITEM-1", { id: 10, sku: "ITEM-1", name: "Item One", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(20);

      const res = await stockService.transferStockService(
        {
          productId: 10,
          fromLocationId: 1,
          toLocationId: 2,
          quantity: 5,
          userId: 99,
          notes: "Nested transfer",
        },
        nestedMockConn,
      );

      expect(res).toEqual({ success: true, message: "Transfer berhasil." });
      expect(nestedMockConn.beginTransaction).not.toHaveBeenCalled();
      expect(nestedMockConn.commit).not.toHaveBeenCalled();
      expect(nestedMockConn.release).not.toHaveBeenCalled();
      expect(signals.refreshStock).not.toHaveBeenCalled();
      expect(notificationService.notifyUsersByPermission).not.toHaveBeenCalled();
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
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(signals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshStock.mock.invocationCallOrder[0],
      );
    });

    test("Fail: Negative adjustment exceeding stock rejects 400 INSUFFICIENT_STOCK", async () => {
      productRepo.getProductById.mockResolvedValue({ id: 25, sku: "ITEM-ADJ" });

      const productMap = new Map();
      productMap.set("ITEM-ADJ", { id: 25, sku: "ITEM-ADJ", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(3);

      await expect(
        stockService.adjustStockService({
          productId: 25,
          locationId: 3,
          quantity: -5,
          userId: 99,
          notes: "Kurangi stok",
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stok SKU 'ITEM-ADJ' tidak cukup untuk dikurangi. Ada: 3, Butuh: 5.",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(locationRepo.incrementStock).not.toHaveBeenCalled();
      expect(signals.refreshStock).not.toHaveBeenCalled();
    });

    test("Support: skips signals when existingConnection is passed", async () => {
      const nestedMockConn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      productRepo.getProductById.mockResolvedValue({ id: 25, sku: "ITEM-ADJ" });
      const productMap = new Map();
      productMap.set("ITEM-ADJ", { id: 25, sku: "ITEM-ADJ", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      const res = await stockService.adjustStockService(
        {
          productId: 25,
          locationId: 3,
          quantity: 5,
          userId: 99,
          notes: "Nested adjust",
        },
        nestedMockConn,
      );

      expect(res).toEqual({ success: true, message: "Penyesuaian stok berhasil." });
      expect(nestedMockConn.beginTransaction).not.toHaveBeenCalled();
      expect(nestedMockConn.commit).not.toHaveBeenCalled();
      expect(nestedMockConn.release).not.toHaveBeenCalled();
      expect(signals.refreshStock).not.toHaveBeenCalled();
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
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(signals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshStock.mock.invocationCallOrder[0],
      );
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
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        isOperational: true,
        message: "Akses ditolak untuk mencatat stok pada lokasi SKU 'PHYSICAL-1'.",
      });
    });

    test("Fail: Package SKU rejected on opname (400 VALIDATION_ERROR)", async () => {
      const productMap = new Map();
      productMap.set("PKG-1", { id: 41, sku: "PKG-1", is_package: true });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      await expect(
        stockService.processBatchOpnameService({
          movements: [{ sku: "PKG-1", quantity: 5, toLocationId: 5 }],
          userId: 99,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Support: skips signals when existingConnection is passed", async () => {
      const nestedMockConn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      const productMap = new Map();
      productMap.set("PHYSICAL-1", { id: 40, sku: "PHYSICAL-1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(5);

      const res = await stockService.processBatchOpnameService(
        {
          movements: [{ sku: "PHYSICAL-1", quantity: 8, toLocationId: 5 }],
          userId: 99,
          userRoleId: 1,
        },
        nestedMockConn,
      );

      expect(res).toEqual({ success: true, count: 1 });
      expect(nestedMockConn.beginTransaction).not.toHaveBeenCalled();
      expect(nestedMockConn.commit).not.toHaveBeenCalled();
      expect(nestedMockConn.release).not.toHaveBeenCalled();
      expect(signals.refreshStock).not.toHaveBeenCalled();
    });
  });

  describe("processBatchMovementsService", () => {
    test("Fail: TRANSFER_MULTI denies non-admin without source location access (403 AppError)", async () => {
      const productMap = new Map();
      productMap.set("PP0002723", { id: 77, sku: "PP0002723", name: "Item Test", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      userRepo.hasLocationAccess.mockResolvedValue(false);

      const err = await stockService
        .processBatchMovementsService({
          type: "TRANSFER_MULTI",
          movements: [{ sku: "PP0002723", quantity: 1, fromLocationId: 12, toLocationId: 15 }],
          userId: 42,
          userRoleId: 2,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.errorCode).toBe("FORBIDDEN");
      expect(err.isOperational).toBe(true);
      expect(err.message).toBe("Akses ditolak untuk lokasi asal SKU 'PP0002723'.");
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(locationRepo.deductStock).not.toHaveBeenCalled();
    });

    test("Success: TRANSFER_MULTI commits once and caches location access per location", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productMap.set("SKU-2", { id: 2, sku: "SKU-2", name: "Item 2", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      userRepo.hasLocationAccess.mockResolvedValue(true);
      locationRepo.getStockAtLocation.mockResolvedValue(10);

      const res = await stockService.processBatchMovementsService({
        type: "TRANSFER_MULTI",
        notes: "Batch multi",
        movements: [
          { sku: "SKU-1", quantity: 2, fromLocationId: 5, toLocationId: 6 },
          { sku: "SKU-2", quantity: 3, fromLocationId: 5, toLocationId: 7 },
        ],
        userId: 42,
        userRoleId: 2,
      });

      expect(res).toEqual({ success: true, count: 2 });
      expect(userRepo.hasLocationAccess).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(signals.refreshStock).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyUsersByPermission).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshStock.mock.invocationCallOrder[0],
      );
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        notificationService.notifyUsersByPermission.mock.invocationCallOrder[0],
      );
    });

    test("Support: skips signals and notifications when existingConnection is passed", async () => {
      const nestedMockConn = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
      };
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(10);

      const res = await stockService.processBatchMovementsService(
        {
          type: "TRANSFER_MULTI",
          notes: "Nested batch",
          movements: [{ sku: "SKU-1", quantity: 2, fromLocationId: 5, toLocationId: 6 }],
          userId: 1,
          userRoleId: 1,
        },
        nestedMockConn,
      );

      expect(res).toEqual({ success: true, count: 1 });
      expect(nestedMockConn.beginTransaction).not.toHaveBeenCalled();
      expect(nestedMockConn.commit).not.toHaveBeenCalled();
      expect(nestedMockConn.release).not.toHaveBeenCalled();
      expect(signals.refreshStock).not.toHaveBeenCalled();
      expect(notificationService.notifyUsersByPermission).not.toHaveBeenCalled();
    });

    test("Fail: Empty SKU throws 400 VALIDATION_ERROR AppError", async () => {
      await expect(
        stockService.processBatchMovementsService({
          type: "TRANSFER_MULTI",
          movements: [{ sku: "   ", quantity: 1, fromLocationId: 1, toLocationId: 2 }],
          userId: 42,
          userRoleId: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        isOperational: true,
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Fail: Insufficient stock throws 400 INSUFFICIENT_STOCK AppError", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(1);

      await expect(
        stockService.processBatchMovementsService({
          type: "TRANSFER_MULTI",
          movements: [{ sku: "SKU-1", quantity: 5, fromLocationId: 1, toLocationId: 2 }],
          userId: 1,
          userRoleId: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stok SKU 'SKU-1' kurang. Ada: 1, Butuh: 5.",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Success: ADJUSTMENT negative quantity deducts stock and logs positive abs qty", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      userRepo.hasLocationAccess.mockResolvedValue(true);
      locationRepo.getStockAtLocation.mockResolvedValue(10);

      const res = await stockService.processBatchMovementsService({
        type: "ADJUSTMENT",
        toLocationId: 5,
        notes: "Koreksi minus",
        movements: [{ sku: "SKU-1", quantity: -4 }],
        userId: 42,
        userRoleId: 2,
      });

      expect(res).toEqual({ success: true, count: 1 });
      expect(locationRepo.getStockAtLocation).toHaveBeenCalledWith(mockConnection, 1, 5, true);
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 1, 5, -4);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId: 1,
          quantity: 4,
          toLocationId: 5,
          type: "ADJUSTMENT",
        }),
      );
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });

    test("Fail: ADJUSTMENT negative quantity exceeding stock rejects 400 INSUFFICIENT_STOCK (Opsi A)", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(3);

      await expect(
        stockService.processBatchMovementsService({
          type: "ADJUSTMENT",
          toLocationId: 5,
          movements: [{ sku: "SKU-1", quantity: -5 }],
          userId: 1,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stok SKU 'SKU-1' tidak cukup untuk dikurangi. Ada: 3, Butuh: 5.",
      });
      expect(locationRepo.incrementStock).not.toHaveBeenCalled();
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Success: ADJUSTMENT positive quantity skips lower-bound stock check", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      const res = await stockService.processBatchMovementsService({
        type: "ADJUSTMENT",
        toLocationId: 5,
        movements: [{ sku: "SKU-1", quantity: 5 }],
        userId: 1,
        userRoleId: 1,
      });

      expect(res).toEqual({ success: true, count: 1 });
      expect(locationRepo.getStockAtLocation).not.toHaveBeenCalled();
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 1, 5, 5);
    });

    test("Fail: ADJUSTMENT negative package breaks into components and rejects when component stock insufficient", async () => {
      const productMap = new Map();
      productMap.set("PKG-1", {
        id: 9,
        sku: "PKG-1",
        name: "Paket 1",
        is_package: true,
        components: [{ id: 11, sku: "COMP-1", name: "Komponen 1", qty_ratio: 3 }],
      });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(4);

      await expect(
        stockService.processBatchMovementsService({
          type: "ADJUSTMENT",
          toLocationId: 5,
          movements: [{ sku: "PKG-1", quantity: -2 }],
          userId: 1,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stok SKU 'COMP-1' tidak cukup untuk dikurangi. Ada: 4, Butuh: 6.",
      });
      expect(locationRepo.incrementStock).not.toHaveBeenCalled();
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Success: ADJUSTMENT negative package breaks into components and logs positive abs qty", async () => {
      const productMap = new Map();
      productMap.set("PKG-1", {
        id: 9,
        sku: "PKG-1",
        name: "Paket 1",
        is_package: true,
        components: [{ id: 11, sku: "COMP-1", name: "Komponen 1", qty_ratio: 3 }],
      });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(10);

      const res = await stockService.processBatchMovementsService({
        type: "ADJUSTMENT",
        toLocationId: 5,
        notes: "Koreksi paket",
        movements: [{ sku: "PKG-1", quantity: -2 }],
        userId: 1,
        userRoleId: 1,
      });

      expect(res).toEqual({ success: true, count: 1 });
      expect(locationRepo.getStockAtLocation).toHaveBeenCalledWith(mockConnection, 11, 5, true);
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 11, 5, -6);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId: 11,
          quantity: 6,
          toLocationId: 5,
          type: "ADJUSTMENT",
          notes: "Koreksi paket [Via PKG-1]",
        }),
      );
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(signals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshStock.mock.invocationCallOrder[0],
      );
    });

    test("Fail: ADJUSTMENT denies non-admin without target location access (403 AppError)", async () => {
      userRepo.hasLocationAccess.mockResolvedValue(false);

      await expect(
        stockService.processBatchMovementsService({
          type: "ADJUSTMENT",
          toLocationId: 5,
          movements: [{ sku: "SKU-1", quantity: 2 }],
          userId: 42,
          userRoleId: 2,
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        errorCode: "FORBIDDEN",
        message: "Akses ditolak. Anda tidak memiliki izin untuk lokasi ini.",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Fail: Unknown movement type throws 400 VALIDATION_ERROR AppError", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      await expect(
        stockService.processBatchMovementsService({
          type: "INVALID_TYPE",
          toLocationId: 5,
          movements: [{ sku: "SKU-1", quantity: 1 }],
          userId: 1,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Tipe pergerakan 'INVALID_TYPE' tidak dikenal.",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
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
      expect(signals.refreshPicking).toHaveBeenCalledTimes(1);
      expect(signals.refreshStock).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshStock.mock.invocationCallOrder[0],
      );
      expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(
        signals.refreshPicking.mock.invocationCallOrder[0],
      );
    });

    test("Support: uses existingConnection without initiating new transaction or premature signals", async () => {
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
      expect(signals.refreshStock).not.toHaveBeenCalled();
      expect(signals.refreshPicking).not.toHaveBeenCalled();
    });

    test("Fail: Return item not found throws 404 NOT_FOUND AppError", async () => {
      pickingRepo.getReturnedItemForValidation.mockResolvedValue(null);

      await expect(
        stockService.validateReturnService({
          pickingListItemId: 999,
          returnToLocationId: 4,
          userId: 99,
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        errorCode: "NOT_FOUND",
        message: "Item retur tidak ditemukan atau sudah diproses.",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(signals.refreshStock).not.toHaveBeenCalled();
      expect(signals.refreshPicking).not.toHaveBeenCalled();
    });
  });

  describe("getStockHistoryService", () => {
    test("Success: delegates to stockRepo.getStockHistory with normalized pagination", async () => {
      const mockRows = [{ id: 1, quantity: 5, movement_type: "TRANSFER" }];
      stockRepo.getStockHistory.mockResolvedValue({ rows: mockRows, total: 32 });

      const res = await stockService.getStockHistoryService(
        10,
        2,
        15,
        "TRANSFER",
        "2026-11-01",
        "2026-11-20",
        3,
        "budi",
      );

      expect(stockRepo.getStockHistory).toHaveBeenCalledWith(mockConnection, {
        productId: 10,
        movementType: "TRANSFER",
        startDate: "2026-11-01",
        endDate: "2026-11-20",
        locationId: 3,
        user: "budi",
        limit: 15,
        offset: 15,
      });
      expect(res).toEqual({
        data: mockRows,
        pagination: {
          total: 32,
          page: 2,
          limit: 15,
          totalPages: 3,
        },
      });
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("getBatchLogsService", () => {
    test("Success: delegates to stockRepo.getBatchLogs with normalized pagination", async () => {
      const mockRows = [{ id: 100, sku: "SKU-1", movement_type: "INBOUND" }];
      stockRepo.getBatchLogs.mockResolvedValue({ rows: mockRows, total: 120 });

      const res = await stockService.getBatchLogsService({
        startDate: "2026-11-01",
        endDate: "2026-11-20",
        productName: "SKU",
        movementType: ["INBOUND"],
        sourceLocation: null,
        destinationLocation: { include: [5] },
        userId: "admin",
        notes: "restock",
        page: 3,
        limit: 50,
      });

      expect(stockRepo.getBatchLogs).toHaveBeenCalledWith(mockConnection, {
        startDate: "2026-11-01",
        endDate: "2026-11-20",
        productName: "SKU",
        movementType: ["INBOUND"],
        sourceLocation: null,
        destinationLocation: { include: [5] },
        userId: "admin",
        notes: "restock",
        limit: 50,
        offset: 100,
      });
      expect(res).toEqual({
        data: mockRows,
        pagination: {
          total: 120,
          page: 3,
          limit: 50,
          totalPages: 3,
        },
      });
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("STOCK_MOVEMENT_TYPE SSOT", () => {
    test("exports frozen movement type constants", () => {
      expect(Object.isFrozen(STOCK_MOVEMENT_TYPE)).toBe(true);
      expect(STOCK_MOVEMENT_TYPE).toEqual({
        TRANSFER: "TRANSFER",
        TRANSFER_MULTI: "TRANSFER_MULTI",
        TRANSFER_IN: "TRANSFER_IN",
        TRANSFER_OUT: "TRANSFER_OUT",
        INBOUND: "INBOUND",
        OUTBOUND: "OUTBOUND",
        RETURN: "RETURN",
        ADJUSTMENT: "ADJUSTMENT",
        OPNAME: "OPNAME",
      });
    });
  });

  describe("processBatchMovementsService (INBOUND / TRANSFER_IN / TRANSFER_OUT / OUTBOUND)", () => {
    test("Success: INBOUND and TRANSFER_IN increment stock and record logs", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      const inboundRes = await stockService.processBatchMovementsService({
        type: STOCK_MOVEMENT_TYPE.INBOUND,
        toLocationId: 8,
        notes: "Restock awal",
        movements: [{ sku: "SKU-1", quantity: 12 }],
        userId: 1,
        userRoleId: 1,
      });

      expect(inboundRes).toEqual({ success: true, count: 1 });
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 1, 8, 12);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          productId: 1,
          quantity: 12,
          fromLocationId: null,
          toLocationId: 8,
          type: STOCK_MOVEMENT_TYPE.INBOUND,
        }),
      );

      jest.clearAllMocks();
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      const transferInRes = await stockService.processBatchMovementsService({
        type: STOCK_MOVEMENT_TYPE.TRANSFER_IN,
        toLocationId: 9,
        notes: "Terima transfer",
        movements: [{ sku: "SKU-1", quantity: 4 }],
        userId: 1,
        userRoleId: 1,
      });

      expect(transferInRes).toEqual({ success: true, count: 1 });
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 1, 9, 4);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          toLocationId: 9,
          type: STOCK_MOVEMENT_TYPE.TRANSFER_IN,
        }),
      );
    });

    test("Fail: INBOUND or TRANSFER_IN rejects 400 VALIDATION_ERROR when destination missing", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      await expect(
        stockService.processBatchMovementsService({
          type: STOCK_MOVEMENT_TYPE.TRANSFER_IN,
          toLocationId: null,
          movements: [{ sku: "SKU-1", quantity: 2 }],
          userId: 1,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Lokasi tujuan wajib diisi.",
      });
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    test("Success: TRANSFER_OUT and OUTBOUND check stock, deduct, and log with null destination", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(15);

      const outRes = await stockService.processBatchMovementsService({
        type: STOCK_MOVEMENT_TYPE.OUTBOUND,
        fromLocationId: 3,
        notes: "Keluar penjualan",
        movements: [{ sku: "SKU-1", quantity: 5 }],
        userId: 1,
        userRoleId: 1,
      });

      expect(outRes).toEqual({ success: true, count: 1 });
      expect(locationRepo.getStockAtLocation).toHaveBeenCalledWith(mockConnection, 1, 3, true);
      expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 1, 3, 5);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          fromLocationId: 3,
          toLocationId: null,
          type: STOCK_MOVEMENT_TYPE.OUTBOUND,
        }),
      );

      jest.clearAllMocks();
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      locationRepo.getStockAtLocation.mockResolvedValue(10);

      await stockService.processBatchMovementsService({
        type: STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
        fromLocationId: 4,
        notes: "Kirim cabang",
        movements: [{ sku: "SKU-1", quantity: 3 }],
        userId: 1,
        userRoleId: 1,
      });

      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          fromLocationId: 4,
          toLocationId: null,
          type: STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
        }),
      );
    });

    test("Fail: TRANSFER_OUT rejects missing source location (400) and insufficient stock (400)", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

      await expect(
        stockService.processBatchMovementsService({
          type: STOCK_MOVEMENT_TYPE.TRANSFER_OUT,
          fromLocationId: null,
          movements: [{ sku: "SKU-1", quantity: 2 }],
          userId: 1,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "VALIDATION_ERROR",
        message: "Lokasi asal wajib diisi.",
      });

      locationRepo.getStockAtLocation.mockResolvedValue(1);
      await expect(
        stockService.processBatchMovementsService({
          type: STOCK_MOVEMENT_TYPE.OUTBOUND,
          fromLocationId: 3,
          movements: [{ sku: "SKU-1", quantity: 5 }],
          userId: 1,
          userRoleId: 1,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errorCode: "INSUFFICIENT_STOCK",
        message: "Stok SKU 'SKU-1' kurang. Ada: 1, Butuh: 5.",
      });
    });
  });

  describe("Template Excel Generators", () => {
    test("generateAdjustmentTemplateService builds Input Stok sheet with hidden DataValidasi dropdown", async () => {
      locationRepo.getAllLocationCodes.mockResolvedValue(["GUDANG-A", "PAJANGAN-B"]);

      const workbook = await stockService.generateAdjustmentTemplateService();
      const mainSheet = workbook.getWorksheet("Input Stok");
      const valSheet = workbook.getWorksheet("DataValidasi");

      expect(mainSheet).toBeDefined();
      expect(valSheet).toBeDefined();
      expect(valSheet.state).toBe("hidden");
      expect(mainSheet.getRow(1).font).toEqual({ bold: true });
      expect(mainSheet.columns.map((c) => c.header)).toEqual([
        "SKU",
        "LT (Lokasi)",
        "ACTUAL",
        "NOTES",
      ]);
      expect(mainSheet.getCell("B2").dataValidation).toMatchObject({
        type: "list",
        formulae: ["DataValidasi!$A$1:$A$2"],
      });
      expect(mainSheet.getCell("B1002").dataValidation).toBeDefined();
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test("generateInboundTemplateService builds Inbound Stok sheet and skips dataValidation when no locations", async () => {
      locationRepo.getAllLocationCodes.mockResolvedValue([]);

      const workbook = await stockService.generateInboundTemplateService();
      const mainSheet = workbook.getWorksheet("Inbound Stok");

      expect(mainSheet).toBeDefined();
      expect(mainSheet.columns.map((c) => c.header)).toEqual([
        "SKU",
        "Lokasi Tujuan",
        "Quantity",
        "Notes",
      ]);
      expect(mainSheet.getCell("B2").dataValidation).toBeUndefined();
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("batchTransferService & getMovementTypesService", () => {
    test("batchTransferService delegates TRANSFER movement batch cleanly", async () => {
      const productMap = new Map();
      productMap.set("SKU-1", { id: 1, sku: "SKU-1", name: "Item 1", is_package: false });
      productRepo.getProductMapWithComponents.mockResolvedValue(productMap);
      userRepo.hasLocationAccess.mockResolvedValue(true);
      locationRepo.getStockAtLocation.mockResolvedValue(10);

      const res = await stockService.batchTransferService({
        fromLocationId: 1,
        toLocationId: 2,
        movements: [{ sku: "SKU-1", quantity: 4 }],
        userId: 5,
        userRoleId: 2,
      });

      expect(res).toEqual({ success: true, count: 1 });
      expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 1, 1, 4);
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 1, 2, 4);
      expect(stockRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          type: STOCK_MOVEMENT_TYPE.TRANSFER,
          notes: "Batch Transfer",
        }),
      );
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });

    test("getMovementTypesService returns movement types from stockRepo via withConnection", async () => {
      stockRepo.getMovementTypes.mockResolvedValue(["ADJUSTMENT", "INBOUND", "TRANSFER"]);

      const types = await stockService.getMovementTypesService();

      expect(stockRepo.getMovementTypes).toHaveBeenCalledWith(mockConnection);
      expect(types).toEqual(["ADJUSTMENT", "INBOUND", "TRANSFER"]);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

});
