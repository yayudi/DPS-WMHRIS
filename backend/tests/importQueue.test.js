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
jest.unstable_mockModule("../config/db.js", () => ({ default: mockDb }));

// Mock FS
jest.unstable_mockModule("fs", () => ({
  default: {
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(),
    createReadStream: jest.fn(),
  },
}));

// Mock ExcelJS (Simplified)
const mockWorkbook = {
  csv: { readFile: jest.fn() },
  xlsx: { readFile: jest.fn(), writeFile: jest.fn() },
  getWorksheet: jest.fn().mockReturnValue({
    rowCount: 5,
    getRow: jest.fn().mockReturnValue({
      values: [],
      getCell: () => ({ value: "" }),
      commit: jest.fn(),
    }),
    commit: jest.fn(),
  }),
  addWorksheet: jest.fn().mockReturnThis(),
};
jest.unstable_mockModule("exceljs", () => ({
  default: { Workbook: jest.fn(() => mockWorkbook) },
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
jest.unstable_mockModule("../repositories/jobRepository.js", () => mockJobRepo);
// Mock repo lain yang di-import tapi tidak dipakai langsung di logic test dasar
jest.unstable_mockModule("../repositories/productRepository.js", () => ({}));
jest.unstable_mockModule("../repositories/locationRepository.js", () => ({}));
jest.unstable_mockModule("../repositories/stockMovementRepository.js", () => ({}));

// Mock Services
const mockParserEngine = { run: jest.fn() };
jest.unstable_mockModule("../services/parsers/ParserEngine.js", () => ({
  ParserEngine: jest.fn(() => mockParserEngine),
}));

const mockPickingImport = { syncOrdersToDB: jest.fn() };
jest.unstable_mockModule("../services/pickingImportService.js", () => mockPickingImport);

const mockAttendanceImport = { processAttendanceImport: jest.fn() };
jest.unstable_mockModule("../services/attendanceImportService.js", () => mockAttendanceImport);

const mockStockImport = { processStockImport: jest.fn() };
jest.unstable_mockModule("../services/stockImportService.js", () => mockStockImport);

// --- IMPORT MODULE UNDER TEST ---
const { importQueue } = await import("../scripts/workers/importQueue.js");

describe("ImportQueue Worker (Basic Flow)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getConnection.mockResolvedValue(mockConn);
  });

  test("Scenario 1: Should exit gracefully if no pending job", async () => {
    // Setup: Tidak ada job pending
    mockJobRepo.getPendingImportJob.mockResolvedValue(null);

    await importQueue();

    expect(mockDb.getConnection).toHaveBeenCalled();
    expect(mockJobRepo.getPendingImportJob).toHaveBeenCalled();
    // Pastikan tidak ada aksi lanjutan
    expect(mockJobRepo.lockImportJob).not.toHaveBeenCalled();
    expect(mockConn.release).toHaveBeenCalled();
  });

  test("Scenario 2: Should process IMPORT_SALES_TOKOPEDIA job successfully", async () => {
    // Setup Job Data
    const jobData = {
      id: 1,
      job_type: "IMPORT_SALES_TOKOPEDIA",
      file_path: "test_sales.csv",
      user_id: 101,
      original_filename: "tokopedia.csv",
    };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    // Setup Parser Output
    mockParserEngine.run.mockResolvedValue({
      orders: new Map([["INV/123", { items: [] }]]),
      stats: { success: 1, totalRows: 1 },
      errors: [],
      headerRowIndex: 1,
    });

    // Setup Picking Service Output
    mockPickingImport.syncOrdersToDB.mockResolvedValue({
      updatedCount: 1,
      errors: [],
    });

    await importQueue();

    // Verifications
    expect(mockJobRepo.lockImportJob).toHaveBeenCalledWith(mockConn, 1);
    expect(mockParserEngine.run).toHaveBeenCalled();
    expect(mockPickingImport.syncOrdersToDB).toHaveBeenCalled();

    // Pastikan Job Completed
    expect(mockJobRepo.completeImportJob).toHaveBeenCalledWith(
      mockConn,
      1,
      "COMPLETED",
      expect.stringContaining("Selesai"), // Cek sebagian pesan log
      expect.any(String) // JSON Log
    );

    expect(mockConn.release).toHaveBeenCalled();
  });

  test("Scenario 3: Should process IMPORT_ATTENDANCE job successfully", async () => {
    const jobData = {
      id: 2,
      job_type: "IMPORT_ATTENDANCE",
      file_path: "attendance.csv",
      user_id: 102,
      original_filename: "attendance.csv", // [FIX] Ditambahkan agar sesuai ekspektasi service
      options: '{"opt": "val"}', // JSON String
    };
    mockJobRepo.getPendingImportJob.mockResolvedValue(jobData);

    // Setup Service Output
    mockAttendanceImport.processAttendanceImport.mockResolvedValue({
      logSummary: "Attendance OK",
      stats: { success: 10 },
      errors: [],
    });

    await importQueue();

    expect(mockAttendanceImport.processAttendanceImport).toHaveBeenCalledWith(
      expect.anything(), // connection
      expect.stringContaining("attendance.csv"), // file path (absolute in worker)
      102, // user_id
      "attendance.csv", // original filename (Sekarang match string literal)
      expect.any(Function), // updateProgress callback
      false, // dryRun
      { opt: "val" } // options parsed
    );

    expect(mockJobRepo.completeImportJob).toHaveBeenCalledWith(
      mockConn,
      2,
      "COMPLETED",
      "Attendance OK",
      expect.any(String)
    );
  });
});
