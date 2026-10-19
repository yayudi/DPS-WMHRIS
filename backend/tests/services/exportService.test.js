// backend/tests/services/exportService.test.js
import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import { PassThrough, Readable } from "stream";

// --- 1. MOCKS ---

// Mock Database
const mockConnection = {
  release: jest.fn(),
};
const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConnection),
};
await jest.unstable_mockModule("../../config/db.js", () => ({
  default: mockDb,
}));

// Mock FS
const mockStream = new PassThrough();
const mockFs = {
  createWriteStream: jest.fn().mockReturnValue(mockStream),
  existsSync: jest.fn().mockReturnValue(false),
};
await jest.unstable_mockModule("fs", () => ({
  default: mockFs,
}));

// Mock Repositories
const mockProductRepo = {
  getProductsWithFilters: jest.fn(),
  getProductsWithFiltersStream: jest.fn(() =>
    Readable.from([
      { sku: "SKU001", name: "Product 1", price: 10000, is_active: 1 },
      { sku: "SKU002", name: "Product 2", price: 20000, is_active: 0 },
    ])
  ),
};
await jest.unstable_mockModule("../../repositories/productRepository.js", () => mockProductRepo);

// Mock Location/Report/Category Repos (Dependency of exportService)
await jest.unstable_mockModule("../../repositories/locationRepository.js", () => ({}));
await jest.unstable_mockModule("../../repositories/reportRepository.js", () => ({}));
await jest.unstable_mockModule("../../repositories/categoryRepository.js", () => ({
  findAllCategories: jest.fn().mockResolvedValue([]),
}));

// --- 2. IMPORT MODULE ---
const { generateProductExportStreaming } = await import("../../services/exportService.js");

// --- 3. TESTS ---
describe("Service: exportService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Should generate CSV export correctly and close stream", async () => {
    // Setup Fresh Stream
    const testStream = new PassThrough();
    testStream.on("error", () => {});
    testStream.resume();
    mockFs.createWriteStream.mockReturnValue(testStream);

    // Setup Data
    const filters = { format: "csv", exportType: "PRODUCT_MASTER" };
    const mockProducts = [
      { sku: "SKU001", name: "Product 1", price: 10000, is_active: 1 },
      { sku: "SKU002", name: "Product 2", price: 20000, is_active: 0 }
    ];
    mockProductRepo.getProductsWithFilters.mockResolvedValue({ data: mockProducts });

    // Execute
    const exportPromise = generateProductExportStreaming(filters, "/tmp/dummy.csv");

    // Assertions
    await expect(exportPromise).resolves.not.toThrow();

    expect(mockDb.getConnection).toHaveBeenCalled();
    expect(mockProductRepo.getProductsWithFiltersStream).toHaveBeenCalled();
    expect(mockFs.createWriteStream).toHaveBeenCalledWith("/tmp/dummy.csv");
    expect(mockConnection.release).toHaveBeenCalled();
  });

  test("Should generate Excel export and close stream", async () => {
    const testStream = new PassThrough();
    testStream.on("error", () => {});
    testStream.resume();
    mockFs.createWriteStream.mockReturnValue(testStream);

    const filters = { format: "xlsx", exportType: "PRODUCT_MASTER" };
    const mockProducts = [
      { sku: "SKU001", name: "Product A", price: 5000 }
    ];
    mockProductRepo.getProductsWithFilters.mockResolvedValue({ data: mockProducts });

    await expect(generateProductExportStreaming(filters, "/tmp/dummy.xlsx")).resolves.not.toThrow();

    expect(mockConnection.release).toHaveBeenCalled();
  });

  test("Should release connection if error occurs", async () => {
    const testStream = new PassThrough();
    mockFs.createWriteStream.mockReturnValue(testStream);

    mockProductRepo.getProductsWithFiltersStream.mockImplementationOnce(() => {
      throw new Error("DB Error");
    });

    await expect(generateProductExportStreaming({ format: "csv" }, "path"))
      .rejects.toThrow("DB Error");

    expect(mockConnection.release).toHaveBeenCalled();
  });
});
