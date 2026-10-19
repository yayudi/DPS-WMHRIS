import { jest } from "@jest/globals";

// ============================================================================
// 1. MOCK SETUP
// ============================================================================

const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(), // For permission checks
};

// Mock config/db.js
jest.unstable_mockModule("../../config/db.js", () => ({
  default: {
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
  },
}));

// Mock Repositories
jest.unstable_mockModule("../../repositories/productRepository.js", () => ({
  getProductMapWithComponents: jest.fn(),
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
    refreshProducts: jest.fn(),
  },
  sendFirebaseSignal: jest.fn(),
}));

// ============================================================================
// 2. IMPORT MODULES
// ============================================================================

const stockService = await import("../../services/stockService.js");
const productRepo = await import("../../repositories/productRepository.js");
const locationRepo = await import("../../repositories/locationRepository.js");
const stockRepo = await import("../../repositories/stockMovementRepository.js");

// ============================================================================
// 3. TEST SUITE
// ============================================================================

describe("stockService.processBatchMovementsService (RETURN)", () => {
  const userId = 101;
  const userRoleId = 2; // Staff (not Admin)

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.beginTransaction.mockResolvedValue();
    mockConnection.commit.mockResolvedValue();
    mockConnection.rollback.mockResolvedValue();
    mockConnection.release.mockResolvedValue();
    mockConnection.query.mockResolvedValue([[]]); // Default empty query result
  });

  test("Success: Manual Return Single Product", async () => {
    const input = {
      type: "RETURN",
      toLocationId: 50,
      movements: [{ sku: "SKU-A", quantity: 5, notes: "Retur Rusak" }],
      userId,
      userRoleId,
      notes: "Global Note",
    };

    // Mock Resolver: Product Found
    const productMap = new Map();
    productMap.set("SKU-A", {
      id: 10,
      sku: "SKU-A",
      name: "Product A",
      is_package: false,
    });
    productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

    // Execute
    const result = await stockService.processBatchMovementsService(input);

    // Assertions
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    // 1. DB Transaction
    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(mockConnection.commit).toHaveBeenCalled();

    // 2. Stock Increment
    expect(locationRepo.incrementStock).toHaveBeenCalledWith(
      mockConnection,
      10, // Product ID
      50, // Location ID
      5   // Quantity
    );

    // 3. Log Created
    expect(stockRepo.createLog).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({
        productId: 10,
        quantity: 5,
        toLocationId: 50,
        type: "RETURN",
        notes: expect.stringContaining("Retur Rusak"),
      })
    );
  });

  test("Success: Manual Return Package (Should breakout components)", async () => {
    const input = {
      type: "RETURN",
      toLocationId: 60,
      movements: [{ sku: "PKG-X", quantity: 2 }],
      userId,
      userRoleId,
    };

    // Mock Resolver: Package Found
    const productMap = new Map();
    productMap.set("PKG-X", {
      id: 99,
      sku: "PKG-X",
      name: "Package X",
      is_package: true,
      components: [
        { id: 101, sku: "COMP-1", qty_ratio: 2 }, // 2 * 2 = 4
        { id: 102, sku: "COMP-2", qty_ratio: 1 }, // 2 * 1 = 2
      ],
    });
    productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

    // Execute
    await stockService.processBatchMovementsService(input);

    // Assertions
    // Log calls to incrementStock: Should be called twice (once for each component)
    expect(locationRepo.incrementStock).toHaveBeenCalledTimes(2);

    // Component 1
    expect(locationRepo.incrementStock).toHaveBeenCalledWith(
      mockConnection,
      101, // Comp ID
      60,  // Location
      4    // Total Qty (2 pkg * 2 ratio)
    );

    // Component 2
    expect(locationRepo.incrementStock).toHaveBeenCalledWith(
      mockConnection,
      102,
      60,
      2
    );
  });

  test("Fail: Missing Target Location", async () => {
    const input = {
      type: "RETURN",
      toLocationId: null, // ERROR
      movements: [{ sku: "SKU-A", quantity: 1 }],
      userId,
    };

    // Resolver needs to pass first
    const productMap = new Map();
    productMap.set("SKU-A", { id: 1, sku: "SKU-A", is_package: false });
    productRepo.getProductMapWithComponents.mockResolvedValue(productMap);

    await expect(stockService.processBatchMovementsService(input))
      .rejects.toThrow("Lokasi tujuan wajib diisi.");

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(locationRepo.incrementStock).not.toHaveBeenCalled();
  });

  test("Fail: SKU Not Found", async () => {
    const input = {
      type: "RETURN",
      toLocationId: 50,
      movements: [{ sku: "UNKNOWN-SKU", quantity: 1 }],
      userId,
    };

    // Resolver returns empty map or map without that SKU
    productRepo.getProductMapWithComponents.mockResolvedValue(new Map());

    await expect(stockService.processBatchMovementsService(input))
      .rejects.toThrow("SKU 'UNKNOWN-SKU' tidak ditemukan di database.");

    expect(mockConnection.rollback).toHaveBeenCalled();
  });
});
