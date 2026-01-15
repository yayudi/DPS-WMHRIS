import { jest } from "@jest/globals";

// --- MOCKS SETUP ---

// 1. Mock Connection Object
const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(), // Default mock
  threadId: 999,
};

// 2. NUCLEAR OPTION: Mock 'mysql2/promise' globally
// This prevents ANY real database connection, regardless of db.js logic
jest.unstable_mockModule("mysql2/promise", () => ({
  createPool: jest.fn(() => ({
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
    // Mock other pool methods if strictly necessary
    query: jest.fn(),
    end: jest.fn(),
  })),
  default: {
    createPool: jest.fn(() => ({
      getConnection: jest.fn(() => Promise.resolve(mockConnection)),
    })),
  },
}));

// 3. Mock Repositories
// We use unstable_mockModule to intercept imports of these files
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
  cancelHeader: jest.fn(),
  cancelItemsByListId: jest.fn(),
}));

jest.unstable_mockModule("../repositories/locationRepository.js", () => ({
  getStockAtLocation: jest.fn(),
  findBestStock: jest.fn(),
  deductStock: jest.fn(),
  incrementStock: jest.fn(),
  getLocationsByProductIds: jest.fn(),
  getTotalStockByProductIds: jest.fn(),
}));

jest.unstable_mockModule("../repositories/stockMovementRepository.js", () => ({
  createLog: jest.fn(),
}));

// 4. Import Modules UNDER TEST (Must be dynamic import after mocks)
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
    // 1. Header is valid
    pickingRepo.getHeaderById.mockResolvedValue({
      id: 1,
      status: "PENDING",
      original_invoice_id: "INV/001",
    });
    // 2. Pending items count > 0 (prevents auto-validate header logic)
    pickingRepo.countPendingItems.mockResolvedValue(1);
    // 3. Update/Insert operations success default
    locationRepo.deductStock.mockResolvedValue({ affectedRows: 1 });
    pickingRepo.validateItem.mockResolvedValue({ affectedRows: 1 });
    stockRepo.createLog.mockResolvedValue({ insertId: 1 });

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
    };

    pickingRepo.getItemsByIds.mockResolvedValue([dbItem]);
    locationRepo.getStockAtLocation.mockResolvedValue(10); // Stok 10 > 5

    // EXECUTE
    const result = await pickingService.completePickingItemsService(payloadItems, 1);

    // ASSERT
    expect(result.success).toBe(true);
    expect(locationRepo.findBestStock).not.toHaveBeenCalled();
    expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 99, 10, 5);

    // ✅ VERIFIKASI INPUT LOG (STOCK MOVEMENTS)
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
    };

    pickingRepo.getItemsByIds.mockResolvedValue([dbItem]);

    // Mock JIT Flow:
    // 1. Find best stock -> Returns ID 50
    locationRepo.findBestStock.mockResolvedValue(50);
    // 2. Check stock at ID 50 -> Returns 5 (Sufficient)
    locationRepo.getStockAtLocation.mockResolvedValue(5);

    // EXECUTE
    const result = await pickingService.completePickingItemsService(payloadItems, 1);

    // ASSERT
    expect(result.success).toBe(true);
    expect(locationRepo.findBestStock).toHaveBeenCalledWith(mockConnection, 88, 2);
    // Should update the item with the new location
    expect(pickingRepo.updateSuggestedLocation).toHaveBeenCalledWith(mockConnection, 202, 50);
    // Should deduct from the NEW location (50)
    expect(locationRepo.deductStock).toHaveBeenCalledWith(mockConnection, 88, 50, 2);

    // ✅ VERIFIKASI INPUT LOG (STOCK MOVEMENTS)
    // Memastikan log dicatat dengan LOKASI BARU (ID 50)
    expect(stockRepo.createLog).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({
        productId: 88,
        quantity: 2,
        fromLocationId: 50, // Lokasi baru hasil pencarian
        type: "SALE",
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
      quantity: 10,
      suggested_location_id: null,
      picking_list_id: 1,
      original_sku: "BRG-C",
    };

    pickingRepo.getItemsByIds.mockResolvedValue([dbItem]);
    // Mock JIT Fail
    locationRepo.findBestStock.mockResolvedValue(null); // Not found anywhere

    // EXECUTE & ASSERT
    await expect(pickingService.completePickingItemsService(payloadItems, 1)).rejects.toThrow(
      /Validasi Gagal/
    ); // Matches error message in service

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(locationRepo.deductStock).not.toHaveBeenCalled();
    // ✅ Pastikan TIDAK ada log yang dibuat jika gagal
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
      /Validasi Gagal/
    );

    // Transaction Integrity Check
    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(locationRepo.deductStock).not.toHaveBeenCalled(); // No stocks should be deducted if batch fails
    // ✅ Pastikan TIDAK ada log yang dibuat karena validasi dilakukan di awal (batch validation)
    expect(stockRepo.createLog).not.toHaveBeenCalled();
  });
});
