import { jest } from "@jest/globals";

// --- 1. MOCKING DEPENDENCIES ---

// Mock Config DB
const mockConn = {
  query: jest.fn(),
  release: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
};
const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConn),
  pool: { end: jest.fn() },
};

// Mock ALL dependencies that importQueue.js uses
// Note: Paths must match what importQueue.js uses OR what the test uses if importing directly
// Since we use unstable_mockModule, we mock based on the path the *module under test* will request.

// importQueue.js imports:
// "../../config/db.js"
// "fs"
// "path"
// "exceljs"
// "url"
// "../../services/parsers/ParserEngine.js"
// "../../services/pickingImportService.js"
// "../../services/attendanceImportService.js"
// "../../services/stockImportService.js"
// "../../repositories/jobRepository.js"
// ... other repos

// We must mock these exact strings as they appear in importQueue.js imports
jest.unstable_mockModule("../../config/db.js", () => ({ default: mockDb }));

jest.unstable_mockModule("fs", () => ({
  default: {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(),
    createReadStream: jest.fn(),
  },
}));

// Mock ExcelJS
const mockWorksheet = {
  rowCount: 10,
  columnCount: 5,
  getRow: jest.fn().mockReturnValue({
    values: [],
    getCell: jest.fn().mockReturnValue({ value: "val" }),
    eachCell: jest.fn(),
  }),
  getColumn: jest.fn().mockReturnValue({ width: 0 }),
  spliceRows: jest.fn(),
  addWorksheet: jest.fn().mockReturnThis(),
};
const mockWorkbook = {
  csv: { readFile: jest.fn() },
  xlsx: { readFile: jest.fn(), writeFile: jest.fn() },
  worksheets: [mockWorksheet],
  getWorksheet: jest.fn().mockReturnValue(mockWorksheet),
  addWorksheet: jest.fn().mockReturnValue(mockWorksheet),
};
jest.unstable_mockModule("exceljs", () => ({
  default: {
    Workbook: jest.fn(() => mockWorkbook),
  },
}));

// Mock Repositories
const mockJobRepo = {
  getPendingImportJob: jest.fn(),
  lockImportJob: jest.fn(),
  updateProgress: jest.fn(),
  completeImportJob: jest.fn(),
  failImportJob: jest.fn(),
  retryImportJob: jest.fn(),
};
jest.unstable_mockModule("../../repositories/jobRepository.js", () => mockJobRepo);
jest.unstable_mockModule("../../repositories/productRepository.js", () => ({}));
jest.unstable_mockModule("../../repositories/locationRepository.js", () => ({}));
jest.unstable_mockModule("../../repositories/stockMovementRepository.js", () => ({}));

// Mock Services
const mockParserEngine = {
  run: jest.fn(),
};
jest.unstable_mockModule("../../services/parsers/ParserEngine.js", () => ({
  ParserEngine: jest.fn(() => mockParserEngine),
}));

const mockPickingImport = { syncOrdersToDB: jest.fn() };
jest.unstable_mockModule("../../services/pickingImportService.js", () => mockPickingImport);

const mockAttendanceImport = { processAttendanceImport: jest.fn() };
jest.unstable_mockModule("../../services/attendanceImportService.js", () => mockAttendanceImport);

const mockStockImport = { processStockImport: jest.fn() };
jest.unstable_mockModule("../../services/stockImportService.js", () => mockStockImport);

// Import Module Under Test
// We need to use the full relative path from this test file
const { importQueue } = await import("../scripts/importQueue.js");

describe("importQueue Worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getConnection.mockResolvedValue(mockConn);
  });

  test("Scenario 1: Should exit gracefully if no pending job", async () => {
    mockJobRepo.getPendingImportJob.mockResolvedValue(null);

    await importQueue();

    expect(mockDb.getConnection).toHaveBeenCalled();
    expect(mockJobRepo.getPendingImportJob).toHaveBeenCalled();
    expect(mockJobRepo.lockImportJob).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("Scenario 2: Should process IMPORT_SALES job successfully", async () => {
    const jobData = {
      id: 1,
      job_type: "IMPORT_SALES_TOKOPEDIA",
      file_path: "test.csv",
      user_id: 123,
      original_filename: "sales.csv",
    };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockParserEngine.run.mockResolvedValue({
      orders: new Map([["INV-1", { items: [] }]]),
      stats: { success: 1, totalRows: 1 },
      errors: [],
      headerRowIndex: 1,
    });
    mockPickingImport.syncOrdersToDB.mockResolvedValue({
      updatedCount: 1,
      errors: [],
    });

    await importQueue();

    expect(mockJobRepo.lockImportJob).toHaveBeenCalledWith(mockConn, 1);
    expect(mockPickingImport.syncOrdersToDB).toHaveBeenCalled();
    expect(mockJobRepo.completeImportJob).toHaveBeenCalledWith(
      mockConn,
      1,
      "COMPLETED",
      expect.stringContaining("Selesai Tokopedia"),
      expect.any(String)
    );
    expect(mockJobRepo.updateProgress).toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalledTimes(2);
  });

  test("Scenario 3: Should process IMPORT_ATTENDANCE job successfully", async () => {
    const jobData = {
      id: 2,
      job_type: "IMPORT_ATTENDANCE",
      file_path: "att.xlsx",
      user_id: 456,
      original_filename: "att.xlsx",
      options: '{"id":"User ID"}',
    };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockAttendanceImport.processAttendanceImport.mockResolvedValue({
      logSummary: "Attendance Success",
      stats: { success: 10 },
      errors: [],
    });

    await importQueue();

    expect(mockAttendanceImport.processAttendanceImport).toHaveBeenCalledWith(
      expect.anything(),
      "att.xlsx",
      456,
      "att.xlsx",
      expect.any(Function),
      false,
      { id: "User ID" }
    );
    expect(mockJobRepo.completeImportJob).toHaveBeenCalledWith(
      mockConn,
      2,
      "COMPLETED",
      "Attendance Success",
      expect.any(String)
    );
  });

  test("Scenario 4: Should handle Dry Run correctly", async () => {
    const jobData = {
      id: 3,
      job_type: "ADJUST_STOCK_DRY_RUN",
      file_path: "stock.xlsx",
      user_id: 789,
      original_filename: "stock.xlsx",
    };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockStockImport.processStockImport.mockResolvedValue({
      logSummary: "Dry Run Stock",
      stats: { success: 5 },
      errors: [],
    });

    await importQueue();

    expect(mockStockImport.processStockImport).toHaveBeenCalledWith(
      expect.anything(),
      "stock.xlsx",
      789,
      "stock.xlsx",
      expect.any(Function),
      true
    );
    expect(mockJobRepo.completeImportJob).toHaveBeenCalledWith(
      mockConn,
      3,
      "COMPLETED",
      "Dry Run Stock",
      expect.any(String)
    );
  });

  test("Scenario 5: Should handle Fatal Error (Fail Job immediately)", async () => {
    const jobData = { id: 4, job_type: "IMPORT_SALES_SHOPEE", file_path: "err.csv" };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockParserEngine.run.mockRejectedValue(new Error("Corrupt File Structure"));

    await importQueue();

    expect(mockJobRepo.failImportJob).toHaveBeenCalledWith(
      mockConn,
      4,
      expect.stringContaining("CRASH: Corrupt File")
    );
    expect(mockJobRepo.retryImportJob).not.toHaveBeenCalled();
  });

  test("Scenario 6: Should Retry on Transient Error (Deadlock)", async () => {
    const jobData = {
      id: 5,
      job_type: "IMPORT_ATTENDANCE",
      file_path: "lock.xlsx",
      retry_count: 0,
    };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockConn.query.mockResolvedValue([[{ retry_count: 0 }]]);

    mockAttendanceImport.processAttendanceImport.mockRejectedValue(
      new Error("Deadlock found when trying to get lock")
    );

    await importQueue();

    expect(mockJobRepo.retryImportJob).toHaveBeenCalledWith(
      mockConn,
      5,
      0,
      "Deadlock found when trying to get lock"
    );
    expect(mockJobRepo.failImportJob).not.toHaveBeenCalled();
  });

  test("Scenario 7: Should Fail after Max Retries reached", async () => {
    const jobData = {
      id: 6,
      job_type: "IMPORT_ATTENDANCE",
      file_path: "lock.xlsx",
      retry_count: 3,
    }; // Max is 3
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockConn.query.mockResolvedValue([[{ retry_count: 3 }]]);

    mockAttendanceImport.processAttendanceImport.mockRejectedValue(
      new Error("Deadlock found when trying to get lock")
    );

    await importQueue();

    expect(mockJobRepo.failImportJob).toHaveBeenCalledWith(
      mockConn,
      6,
      expect.stringContaining("CRASH: Deadlock")
    );
    expect(mockJobRepo.retryImportJob).not.toHaveBeenCalled();
  });

  test("Scenario 8: Should generate Error Excel on Partial Failure", async () => {
    const jobData = { id: 7, job_type: "IMPORT_SALES_OFFLINE", file_path: "partial.csv" };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    mockParserEngine.run.mockResolvedValue({
      orders: new Map(),
      stats: { success: 0, totalRows: 5 },
      errors: [{ row: 2, message: "Invalid SKU" }],
      headerRowIndex: 1,
    });
    mockPickingImport.syncOrdersToDB.mockResolvedValue({ updatedCount: 0, errors: [] });

    await importQueue();

    expect(mockJobRepo.completeImportJob).toHaveBeenCalledWith(
      mockConn,
      7,
      "COMPLETED_WITH_ERRORS",
      expect.any(String),
      expect.stringContaining("download_url")
    );
    expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalled();
  });
});
