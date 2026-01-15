import { jest } from "@jest/globals";
import { Readable } from "stream";

// --- SETUP DATA ---
const MOCK_CSV_CONTENT = `Company Name
Device Info
Period: From 2025/10/01 To 2025/10/31
User ID,Full Name,Date/Time
101,Budi Santoso,2025/10/01 07:50:00
101,Budi Santoso,2025/10/01 17:10:00
102,Siti Aminah,2025/10/01 08:15:00
102,Siti Aminah,2025/10/01 16:00:00
`;

const createMockStream = (content) => {
  const s = new Readable();
  s.push(content);
  s.push(null);
  return s;
};

// --- 1. MOCKING DEPENDENCIES ---

// Define mocks outside factory to control them in tests
const mockReadFile = jest.fn();
const mockCreateReadStream = jest.fn();
const mockUnlink = jest.fn().mockResolvedValue(true);
const mockExistsSync = jest.fn().mockReturnValue(true);

// Mock FS (File System)
// Kita mock struktur default dan promises untuk menangani berbagai cara import
jest.unstable_mockModule("fs", () => ({
  promises: {
    readFile: mockReadFile,
    unlink: mockUnlink,
  },
  default: {
    promises: {
      readFile: mockReadFile,
      unlink: mockUnlink,
    },
    createReadStream: mockCreateReadStream,
    existsSync: mockExistsSync,
  },
}));

// Mock Config DB
const mockConn = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule("../config/db.js", () => ({
  default: {
    getConnection: jest.fn(() => Promise.resolve(mockConn)),
  },
}));

// --- 2. IMPORT MODULES ---
// Import module yang akan dites SETELAH mock didefinisikan
const attendanceService = await import("../services/attendanceImportService.js");

describe("attendanceImportService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 1. Setup Default FS Behavior (Happy Path)
    // PENTING: readFile digunakan parser untuk cek metadata tanggal di header
    mockReadFile.mockResolvedValue(MOCK_CSV_CONTENT);
    // createReadStream digunakan parser untuk memproses baris per baris
    mockCreateReadStream.mockImplementation(() => createMockStream(MOCK_CSV_CONTENT));

    // 2. Setup Default DB Behavior
    mockConn.beginTransaction.mockResolvedValue();
    mockConn.commit.mockResolvedValue();
    mockConn.rollback.mockResolvedValue();
    mockConn.release.mockResolvedValue();

    // Setup Mock Query Database Default
    mockConn.query.mockImplementation(async (sql, params) => {
      // Mock Check User Exists (Select ID/Name from Users)
      if (sql.includes("SELECT username FROM users") || sql.includes("SELECT id, username")) {
        return [
          [
            { id: 1, username: "Budi Santoso" },
            { id: 2, username: "Siti Aminah" },
            { id: 3, username: "Joko Widodo" },
          ],
        ];
      }
      // Mock Check Attendance Log Exists
      if (sql.includes("SELECT id FROM attendance_logs")) {
        return [[{ id: 999 }]]; // Default: Log sudah ada (Update flow)
      }
      // Default: Success Insert/Update result
      return [{ insertId: 123, affectedRows: 1 }];
    });
  });

  // ==========================================================
  // TEST CASES
  // ==========================================================

  test("Scenario 1: Full Import Success (Normal Mode)", async () => {
    const onProgress = jest.fn();

    // Override mock query: Simulasi Log Belum Ada (agar terjadi Insert)
    mockConn.query.mockImplementation(async (sql) => {
      if (sql.includes("SELECT id FROM attendance_logs")) return [[]]; // Log Not Found -> Insert Baru
      if (sql.includes("SELECT id, username")) return [[{ id: 1, username: "Budi Santoso" }]];
      return [{ insertId: 100, affectedRows: 1 }];
    });

    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "dummy.csv",
      1,
      "file_asli.csv",
      onProgress,
      false
    );

    // Assert Success
    expect(result.success).toBe(true);
    expect(result.stats.success).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Transaction Check
    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();

    // Verify Data Processing
    // Memastikan ada query INSERT ke attendance_logs
    const calls = mockConn.query.mock.calls.filter((call) =>
      call[0].includes("INSERT INTO attendance_logs")
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(onProgress).toHaveBeenCalled();
  });

  test("Scenario 2: Dry Run Mode (Simulasi)", async () => {
    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "dummy.csv",
      1,
      "file_asli.csv",
      null,
      true
    );

    expect(result.success).toBe(true);
    expect(result.stats.success).toBeGreaterThan(0);

    // Dry Run HARUS rollback, tidak boleh commit
    expect(mockConn.rollback).toHaveBeenCalled();
    expect(mockConn.commit).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
  });

  test("Scenario 3: Parsing Date Period Failure", async () => {
    const BAD_CSV = `Header 1\nHeader 2\nHeader 3 (No Date)\nUser ID,Name,Date/Time\n`;

    // Override FS mocks khusus untuk test ini agar mengembalikan CSV rusak
    mockReadFile.mockResolvedValueOnce(BAD_CSV);
    mockCreateReadStream.mockImplementationOnce(() => createMockStream(BAD_CSV));

    // Expect Error: Service harus throw error jika tanggal tidak ditemukan di header
    await expect(attendanceService.processAttendanceImport(mockConn, "bad.csv", 1)).rejects.toThrow(
      /Gagal mendeteksi/
    );

    expect(mockConn.rollback).toHaveBeenCalled();
  });

  test("Scenario 4: Handling Database Error (Row Level)", async () => {
    // Simulasi error saat insert, tapi user ditemukan
    mockConn.query
      .mockResolvedValueOnce([[{ id: 1, username: "Budi Santoso" }]]) // Cek User Success
      .mockRejectedValueOnce(new Error("DB Connection Lost")); // Insert Error Fail

    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "dummy.csv",
      1,
      "file_asli.csv",
      null,
      false
    );

    // Error harus tertangkap di array errors, tidak crash total service
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toContain("DB Connection Lost");

    // Karena ada error parsial, success tetap true (biasanya), tapi dengan catatan error
    // Atau tergantung implementasi service Anda, jika "Fail Fast" maka success false.
    // Berdasarkan kode umum import queue, ini partial success.
  });

  test("Scenario 5: Handling Fatal Database Error (Top Level)", async () => {
    // Simulasi gagal memulai transaksi
    mockConn.beginTransaction.mockRejectedValueOnce(new Error("Transaction Failed"));

    await expect(
      attendanceService.processAttendanceImport(mockConn, "dummy.csv", 1)
    ).rejects.toThrow("Transaction Failed");
  });

  test("Scenario 6: Custom Column Mapping (Non-Standard CSV)", async () => {
    // Mock Custom CSV dengan header berbeda
    const CUSTOM_CSV = `Metadata...
Metadata...
From 2025/11/01 To 2025/11/30
Nomor Pegawai,Nama Lengkap,Waktu Absen
103,Joko Widodo,2025/11/01 08:00:00
103,Joko Widodo,2025/11/01 17:00:00
`;
    // Override FS mocks dengan CSV custom
    mockReadFile.mockResolvedValueOnce(CUSTOM_CSV);
    mockCreateReadStream.mockImplementationOnce(() => createMockStream(CUSTOM_CSV));

    // Mapping custom columns
    const mapping = { id: "Nomor Pegawai", name: "Nama Lengkap", time: "Waktu Absen" };

    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "custom.csv",
      1,
      "custom.csv",
      null,
      false,
      mapping
    );

    // Verifikasi sukses parsing user "Joko Widodo"
    expect(result.stats.success).toBeGreaterThan(0);

    // Cek apakah query DB menggunakan nama yang benar
    const calls = mockConn.query.mock.calls.flat().join(" ");
    expect(calls).toContain("Joko Widodo");
  });
});
