import { jest } from "@jest/globals";

// --- MOCKS SETUP ---

// 1. Mock Connection Object
const mockConnection = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

// 2. Mock Dependencies
// Mock ParserEngine
const mockParserRun = jest.fn();
jest.unstable_mockModule("../services/parsers/ParserEngine.js", () => ({
  ParserEngine: jest.fn().mockImplementation(() => ({
    run: mockParserRun,
  })),
}));

// Mock Product Repository
jest.unstable_mockModule("../repositories/productRepository.js", () => ({
  getIdBySku: jest.fn(),
  updateProductTransaction: jest.fn(),
  createProductTransaction: jest.fn(),
  restoreProduct: jest.fn(),
  softDeleteProduct: jest.fn(),
  getProductsWithFilters: jest.fn(),
  searchProducts: jest.fn(),
}));

// Import Modules (Dynamic Import after Mocks)
const productImportService = await import("../services/productImportService.js");
const productRepo = await import("../repositories/productRepository.js");

// --- TEST SUITE ---

describe("Product Import Service - Logic Processing", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default Mock Behavior: Parser returns empty
    mockParserRun.mockResolvedValue({
      orders: new Map(),
      stats: {},
      errors: [],
    });

    // Default DB Mock: Empty (Item Not Found)
    mockConnection.query.mockResolvedValue([[]]);
  });

  test("Scenario 1: Update Existing Product (SKU Found)", async () => {
    // SETUP
    const csvData = new Map();
    csvData.set("SKU-EXIST", {
      sku: "SKU-EXIST",
      name: "Produk Lama Update",
      price: 50000,
      row: 1,
    });

    mockParserRun.mockResolvedValue({
      orders: csvData,
      stats: {},
      errors: [],
    });

    // Mock DB Query: SKU ditemukan (Return 1 row)
    mockConnection.query.mockResolvedValue([
      [{ id: 10, sku: "SKU-EXIST", name: "Produk Lama", price: 40000 }],
    ]);

    // EXECUTE
    const result = await productImportService.processProductImport(
      mockConnection,
      "dummy/path.xlsx",
      1, // UserId
      "test.xlsx",
      null, // progress callback
      false // DryRun = false
    );

    // ASSERT
    expect(result.stats.success).toBe(1);
    // Pastikan update dipanggil
    expect(productRepo.updateProductTransaction).toHaveBeenCalledWith(
      mockConnection,
      10, // Product ID
      expect.objectContaining({ name: "Produk Lama Update", price: 50000 }), // Payload
      expect.any(Array),
      1 // UserId
    );
    // Create tidak boleh dipanggil
    expect(productRepo.createProductTransaction).not.toHaveBeenCalled();
  });

  test("Scenario 2: Create New Product (SKU Not Found)", async () => {
    // SETUP
    const csvData = new Map();
    csvData.set("SKU-NEW", {
      sku: "SKU-NEW",
      name: "Produk Baru",
      price: 100000,
      weight: 500,
      row: 2,
    });

    mockParserRun.mockResolvedValue({ orders: csvData, stats: {}, errors: [] });

    // Mock DB Query: SKU TIDAK ditemukan (Empty array default from beforeEach)
    mockConnection.query.mockResolvedValue([[]]);

    // EXECUTE
    const result = await productImportService.processProductImport(
      mockConnection,
      "dummy/path.xlsx",
      1,
      "test.xlsx",
      null,
      false
    );

    // ASSERT
    expect(result.stats.success).toBe(1);
    // Pastikan create dipanggil
    expect(productRepo.createProductTransaction).toHaveBeenCalledWith(
      mockConnection,
      expect.objectContaining({
        sku: "SKU-NEW",
        name: "Produk Baru",
        price: 100000,
      }),
      expect.any(Array),
      1
    );
    expect(productRepo.updateProductTransaction).not.toHaveBeenCalled();
  });

  test("Scenario 3: Dry Run Mode (Simulasi)", async () => {
    // SETUP
    const csvData = new Map();
    csvData.set("SKU-TEST", { sku: "SKU-TEST", name: "Test", price: 100, row: 1 });
    mockParserRun.mockResolvedValue({ orders: csvData, stats: {}, errors: [] });

    // Mock DB: SKU ditemukan
    mockConnection.query.mockResolvedValue([[{ id: 1, sku: "SKU-TEST" }]]);

    // EXECUTE (DryRun = true)
    const result = await productImportService.processProductImport(
      mockConnection,
      "dummy/path.xlsx",
      1,
      "test.xlsx",
      null,
      true // ✅ DRY RUN
    );

    // ASSERT
    expect(result.logSummary).toContain("[SIMULASI]");
    // Repository TIDAK boleh dipanggil sama sekali
    expect(productRepo.updateProductTransaction).not.toHaveBeenCalled();
    expect(productRepo.createProductTransaction).not.toHaveBeenCalled();
  });

  test("Scenario 4: Resume Processing (Pagination)", async () => {
    // SETUP: 3 Data
    const csvData = new Map();
    csvData.set("SKU-1", { sku: "SKU-1", name: "A", row: 1 });
    csvData.set("SKU-2", { sku: "SKU-2", name: "B", row: 2 });
    csvData.set("SKU-3", { sku: "SKU-3", name: "C", row: 3 });

    mockParserRun.mockResolvedValue({ orders: csvData, stats: {}, errors: [] });
    mockConnection.query.mockResolvedValue([[]]); // Anggap semua data baru

    // EXECUTE (Start from index 1 -> Skip SKU-1)
    await productImportService.processProductImport(
      mockConnection,
      "dummy/path.xlsx",
      1,
      "test.xlsx",
      null,
      false,
      { lastRow: 1 } // ✅ Resume Options
    );

    // ASSERT
    // Create harusnya hanya dipanggil 2 kali (SKU-2 dan SKU-3)
    expect(productRepo.createProductTransaction).toHaveBeenCalledTimes(2);
    expect(productRepo.createProductTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sku: "SKU-2" }), // First processed
      expect.anything(),
      expect.anything()
    );
  });
});
