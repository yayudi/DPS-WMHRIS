// backend/tests/workers/exportQueue.test.js
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

// --- 1. MOCK DEPENDENCIES (ESM Style) ---
// Mock Database
const mockConnection = {
  release: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
};
const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConnection),
};
await jest.unstable_mockModule("../../config/db.js", () => ({
  default: mockDb,
}));

// Mock FS & Path (Avoid real file creation)
await jest.unstable_mockModule("fs", () => ({
  default: {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024 }), // Simulasi file ada size
    createWriteStream: jest.fn(), // Tidak dipakai langsung di worker, tapi good practice
  },
}));

// Mock Repositories
const mockJobRepo = {
  timeoutStuckExportJobs: jest.fn(),
  getAndLockPendingExportJob: jest.fn(),
  completeExportJob: jest.fn(),
  failExportJob: jest.fn(),
};
await jest.unstable_mockModule("../../repositories/jobRepository.js", () => mockJobRepo);

// Mock Services
const mockExportService = {
  generateProductExportStreaming: jest.fn(),
  generateStockReportStreaming: jest.fn(),
};
await jest.unstable_mockModule("../../services/exportService.js", () => mockExportService);

// --- 2. IMPORT MODULE UNDER TEST ---
const { processQueue } = await import("../../scripts/workers/exportQueue.js");

// --- 3. TEST SUITE ---
describe("Worker: exportQueue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Should do nothing if no pending job found", async () => {
    mockJobRepo.getAndLockPendingExportJob.mockResolvedValue(null);

    await processQueue();

    expect(mockDb.getConnection).toHaveBeenCalled();
    expect(mockJobRepo.getAndLockPendingExportJob).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
  });

  test("Should process PRODUCT_MASTER export successfully when filters is JSON string", async () => {
    // Setup Data
    const mockJob = {
      id: 123,
      filters: JSON.stringify({ exportType: "PRODUCT_MASTER", format: "xlsx" }),
    };
    mockJobRepo.getAndLockPendingExportJob.mockResolvedValue(mockJob);
    mockExportService.generateProductExportStreaming.mockResolvedValue(true);

    // Action
    await processQueue();

    expect(mockExportService.generateProductExportStreaming).toHaveBeenCalled();
    const serviceCallArgs = mockExportService.generateProductExportStreaming.mock.calls[0];
    expect(serviceCallArgs[0]).toEqual({ exportType: "PRODUCT_MASTER", format: "xlsx" });
    expect(serviceCallArgs[1]).toMatch(/\.xlsx$/);

    // Should complete job
    expect(mockJobRepo.completeExportJob).toHaveBeenCalledWith(
        expect.anything(),
        123,
        expect.stringMatching(/Master_Produk_.*\.xlsx/)
    );
  });

  test("Should process export successfully when filters is already an Object (Shared Hosting MySQL 8.0)", async () => {
    // Setup Data as Pre-parsed Object
    const mockJob = {
      id: 789,
      filters: { exportType: "STOCK_REPORT", format: "csv" },
    };
    mockJobRepo.getAndLockPendingExportJob.mockResolvedValue(mockJob);
    mockExportService.generateStockReportStreaming.mockResolvedValue(true);

    await processQueue();

    expect(mockExportService.generateStockReportStreaming).toHaveBeenCalled();
    const serviceCallArgs = mockExportService.generateStockReportStreaming.mock.calls[0];
    expect(serviceCallArgs[0]).toEqual({ exportType: "STOCK_REPORT", format: "csv" });
    expect(serviceCallArgs[1]).toMatch(/\.csv$/);

    expect(mockJobRepo.completeExportJob).toHaveBeenCalledWith(
        expect.anything(),
        789,
        expect.stringMatching(/Laporan_Stok_.*\.csv/)
    );
  });

  test("Should process STOCK_REPORT export successfully", async () => {
     // Setup Data
     const mockJob = {
        id: 456,
        filters: JSON.stringify({ exportType: "STOCK_REPORT" }),
      };
      mockJobRepo.getAndLockPendingExportJob.mockResolvedValue(mockJob);
      mockExportService.generateStockReportStreaming.mockResolvedValue(true);

      // Action
      await processQueue();

      // Assertions
      expect(mockExportService.generateStockReportStreaming).toHaveBeenCalled();
      expect(mockJobRepo.completeExportJob).toHaveBeenCalledWith(
          expect.anything(),
          456,
          expect.stringMatching(/Laporan_Stok_.*\.xlsx/)
      );
  });

  test("Should fail job if service throws error", async () => {
    const mockJob = {
      id: 999,
      filters: JSON.stringify({ exportType: "PRODUCT_MASTER" }),
    };
    mockJobRepo.getAndLockPendingExportJob.mockResolvedValue(mockJob);
    mockExportService.generateProductExportStreaming.mockRejectedValue(new Error("Service Crash"));

    await processQueue();

    expect(mockJobRepo.failExportJob).toHaveBeenCalledWith(
        expect.anything(),
        999,
        "Service Crash"
    );
    expect(mockJobRepo.completeExportJob).not.toHaveBeenCalled();
  });
});
