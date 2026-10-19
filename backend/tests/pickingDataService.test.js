import { jest } from "@jest/globals";

// --- MOCKS SETUP ---

// Mock Connection Object
const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(), // Default mock
  threadId: 999,
};

// NUCLEAR OPTION: Mock 'mysql2/promise' globally
jest.unstable_mockModule("mysql2/promise", () => ({
  createPool: jest.fn(() => ({
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
    query: jest.fn(),
    end: jest.fn(),
  })),
  default: {
    createPool: jest.fn(() => ({
      getConnection: jest.fn(() => Promise.resolve(mockConnection)),
    })),
  },
}));

// Mock Firebase Signal Service to prevent hanging open sockets
jest.unstable_mockModule("../services/firebaseSignalService.js", () => ({
  emitSharedTaskSignal: jest.fn().mockResolvedValue(),
  emitUserSignal: jest.fn().mockResolvedValue(),
  signals: {
    refreshPicking: jest.fn().mockResolvedValue(true),
    refreshStock: jest.fn().mockResolvedValue(true),
  },
}));

// Mock Repositories
jest.unstable_mockModule("../repositories/pickingRepository.js", () => ({
  getHeaderById: jest.fn(),
  getItemsByIds: jest.fn(),
  updateSuggestedLocation: jest.fn(),
  validateItem: jest.fn(),
  countPendingItems: jest.fn(),
  validateHeader: jest.fn(),
  markItemAsReturned: jest.fn(),
  archiveHeader: jest.fn(),
  updateHeaderStatus: jest.fn(),
  updateMarketplaceStatus: jest.fn(),
  updateItemsStatusByListId: jest.fn(),
  voidHeader: jest.fn(),
  voidItemsByListId: jest.fn(),
  getValidatedItemsForRestock: jest.fn(),
  getUnfulfillableItemsByListId: jest.fn(),
  updateItemAllocation: jest.fn(),
  insertPickingItem: jest.fn(),
  getPendingAndBackorderItemsByListIds: jest.fn(),
  getUnfulfillableSkusByListId: jest.fn(),
  deleteItemsByPickingListId: jest.fn(),
  getReturnedItemForValidation: jest.fn(),
}));

jest.unstable_mockModule("../repositories/locationRepository.js", () => ({
  getStockAtLocation: jest.fn(),
  findBestStock: jest.fn(),
  deductStock: jest.fn(),
  incrementStock: jest.fn(),
  getLocationsByProductIds: jest.fn(),
  getTotalStockByProductIds: jest.fn(),
  getStockLocationsForUpdate: jest.fn(),
  getSimpleStockLocationsForUpdate: jest.fn(),
}));

jest.unstable_mockModule("../repositories/stockMovementRepository.js", () => ({
  createLog: jest.fn(),
}));

// Import Modules UNDER TEST (Must be dynamic import after mocks)
const pickingService = await import("../services/pickingDataService.js");
const pickingRepo = await import("../repositories/pickingRepository.js");
const locationRepo = await import("../repositories/locationRepository.js");
const stockRepo = await import("../repositories/stockMovementRepository.js");

// --- TEST SUITE ---

describe("PickingDataService - Complete Items Logic", () => {
  // Silence console logs during tests to keep output clean
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  beforeAll(() => {
    console.error = jest.fn();
    console.log = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Default Mock Behaviors
    // Header is valid
    pickingRepo.getHeaderById.mockResolvedValue({
      id: 1,
      status: "PENDING",
      original_invoice_id: "INV/001",
    });
    // Pending items count > 0 (prevents auto-validate header logic)
    pickingRepo.countPendingItems.mockResolvedValue(1);
    // Update/Insert operations success default
    locationRepo.deductStock.mockResolvedValue({ affectedRows: 1 });
    pickingRepo.validateItem.mockResolvedValue({ affectedRows: 1 });
    stockRepo.createLog.mockResolvedValue({ insertId: 1 });

    pickingRepo.getUnfulfillableSkusByListId.mockResolvedValue([]);
    locationRepo.getStockLocationsForUpdate.mockResolvedValue([]);
    locationRepo.getSimpleStockLocationsForUpdate.mockResolvedValue([]);

    // Ensure mockConnection.query also returns something valid by default to prevent crashes
    mockConnection.query.mockResolvedValue([[], []]);
  });

  test("Scenario 1: Happy Path (Stok cukup di lokasi awal)", async () => {
    // SETUP
    const payloadItems = [{ id: 101, picking_list_id: 1 }];
    const dbItem = {
      id: 101,
      product_id: 99,
      quantity: 5,
      suggested_location_id: 10,
      picking_list_id: 1,
      original_sku: "BRG-A",
      status: "PENDING"
    };

    pickingRepo.getItemsByIds.mockResolvedValue([dbItem]);
    pickingRepo.getHeaderById.mockResolvedValue({ original_invoice_id: "INV-1" });

    // Mock bulk query for stocks
    locationRepo.getStockLocationsForUpdate.mockResolvedValue([
      { product_id: 99, location_id: 10, quantity: 10, purpose: "DISPLAY" },
    ]);

    // EXECUTE
    const result = await pickingService.completePickingItemsService(payloadItems, 1);

    // ASSERT
    expect(result.success).toBe(true);
    expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 99, 10, 5);

    // VERIFIKASI INPUT LOG (STOCK MOVEMENTS)
    // Memastikan sistem mencatat pergerakan stok 'SALE'
    expect(stockRepo.createLog).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({
        productId: 99,
        quantity: 5,
        fromLocationId: 10,
        type: "SALE",
        userId: 1, // Default userId dari test call
        notes: expect.stringContaining("Item #101"),
      })
    );

    expect(mockConnection.commit).toHaveBeenCalled();
  });

  test("Scenario 2: JIT / Backorder Resolved (Lokasi awal kosong, ketemu di Display)", async () => {
    // SETUP
    const payloadItems = [{ id: 202, picking_list_id: 1 }];
    const dbItem = {
      id: 202,
      product_id: 88,
      quantity: 2,
      suggested_location_id: null, // BACKORDER
      picking_list_id: 1,
      original_sku: "BRG-B",
      status: "BACKORDER"
    };

    pickingRepo.getItemsByIds.mockResolvedValue([dbItem]);
    pickingRepo.getHeaderById.mockResolvedValue({ original_invoice_id: "INV-1" });


    // Mock bulk query for stocks (Loc 50 has 5 stock, purpose DISPLAY)
    locationRepo.getStockLocationsForUpdate.mockResolvedValue([
      { product_id: 88, location_id: 50, quantity: 5, purpose: "DISPLAY" },
    ]);

    // EXECUTE
    const result = await pickingService.completePickingItemsService(payloadItems, 1);

    // ASSERT
    expect(result.success).toBe(true);
    expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 88, 50, 2);

    // Memastikan audit log menggunakan fromLocationId = 50
    expect(stockRepo.createLog).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({
        fromLocationId: 50,
      })
    );

    expect(mockConnection.commit).toHaveBeenCalled();
  });

  test("Scenario 3: Fail (Stok benar-benar habis dimanapun)", async () => {
    // SETUP
    const payloadItems = [{ id: 303, picking_list_id: 1 }];
    const dbItem = {
      id: 303,
      product_id: 77,
      quantity: 10, // Butuh 10
      suggested_location_id: 10,
      picking_list_id: 1,
      status: "PENDING"
    };

    pickingRepo.getItemsByIds.mockResolvedValue([dbItem]);
    pickingRepo.getHeaderById.mockResolvedValue({ original_invoice_id: "INV-1" });


    // Mock bulk query for stocks: Cuma ada 2 di loc 10
    locationRepo.getStockLocationsForUpdate.mockResolvedValue([
      { product_id: 77, location_id: 10, quantity: 2, purpose: "DISPLAY" },
    ]);

    // EXECUTE & ASSERT
    await expect(pickingService.completePickingItemsService(payloadItems, 1)).rejects.toThrow(
      /Sebagian pesanan gagal diproses karena masalah ketersediaan stok/
    );

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(locationRepo.deductStock).not.toHaveBeenCalled();
    expect(stockRepo.createLog).not.toHaveBeenCalled();
  });

  test("Scenario 4: Mixed Batch (1 Sukses, 1 Gagal) -> Atomic Rollback", async () => {
    // SETUP
    const payloadItems = [{ id: 1 }, { id: 2 }];
    const dbItems = [
      {
        id: 1,
        product_id: 10,
        quantity: 1,
        suggested_location_id: 5,
        picking_list_id: 1,
        original_sku: "ITEM-A",
      },
      {
        id: 2,
        product_id: 20,
        quantity: 1,
        suggested_location_id: null,
        picking_list_id: 1,
        original_sku: "ITEM-B",
      },
    ];

    pickingRepo.getItemsByIds.mockResolvedValue(dbItems);

    locationRepo.getStockLocationsForUpdate.mockResolvedValue([
      { product_id: 10, location_id: 5, quantity: 5, purpose: "DISPLAY" },
    ]);

    // Mock Behaviors based on inputs
    locationRepo.getStockAtLocation.mockImplementation((conn, pid) => {
      if (pid === 10) return Promise.resolve(5); // Item A: Sufficient
      return Promise.resolve(0);
    });

    locationRepo.findBestStock.mockImplementation((conn, pid) => {
      if (pid === 20) return Promise.resolve(null); // Item B: Not found
      return Promise.resolve(null);
    });

    // EXECUTE & ASSERT
    await expect(pickingService.completePickingItemsService(payloadItems, 1)).rejects.toThrow(
      /Sebagian pesanan gagal diproses karena masalah ketersediaan stok/
    );

    // Transaction Integrity Check
    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(locationRepo.deductStock).not.toHaveBeenCalled(); // No stocks should be deducted if batch fails
    // Pastikan TIDAK ada log yang dibuat karena validasi dilakukan di awal (batch validation)
    expect(stockRepo.createLog).not.toHaveBeenCalled();
  });

  describe("forceFinishPickingItemsService", () => {
    it("should auto-adjust deficit at Rak Display Utama (A12 - 1, ID: 2) even with negative stock and complete successfully", async () => {
      // Setup header
      pickingRepo.getHeaderById.mockResolvedValue({
        id: 10,
        original_invoice_id: "INV-FORCE-001",
        status: "PENDING",
      });

      // Setup payload: item with shortage
      const payloadItems = [
        { id: 101, picking_list_id: 10, product_id: 55, quantity: 5, location_id: null },
      ];

      // Setup DB item (status BACKORDER)
      pickingRepo.getItemsByIds.mockResolvedValue([
        {
          id: 101,
          picking_list_id: 10,
          product_id: 55,
          quantity: 5,
          suggested_location_id: null,
          original_sku: "SKU-MINUS-STOCK",
          status: "BACKORDER",
        },
      ]);

      // Mock locationRepo for FOR UPDATE stock lock: current stock at ID 2 is -10 (negative stock case!)
      locationRepo.getSimpleStockLocationsForUpdate.mockResolvedValue([
        { product_id: 55, location_id: 2, quantity: -10 },
      ]);

      pickingRepo.countPendingItems.mockResolvedValue(0);

      // EXECUTE
      const result = await pickingService.forceFinishPickingItemsService(payloadItems, 999);

      // ASSERT
      expect(result.success).toBe(true);
      expect(result.data.processedCount).toBe(1);
      // Deficit formula: Math.max(0, 5 - (-10)) = 15!
      expect(result.data.adjustedQty).toBe(15);

      // Verify incrementStock was called with 15 for location 2
      expect(locationRepo.incrementStock).toHaveBeenCalledWith(mockConnection, 55, 2, 15);

      // Verify deductStock was called with 5 for location 2
      expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 55, 2, 5);

      // Verify validateItem was called
      expect(pickingRepo.validateItem).toHaveBeenCalledWith(mockConnection, 101, 2);

      // Verify header was validated since remaining pending items = 0
      expect(pickingRepo.validateHeader).toHaveBeenCalledWith(mockConnection, 10);
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });
});

