import { jest } from "@jest/globals";
import { Readable } from "stream";

// --- 1. MOCKING DEPENDENCIES ---

// Mock Module FS (File System)
jest.unstable_mockModule("fs", () => ({
  default: {
    createReadStream: jest.fn(),
    promises: {
      unlink: jest.fn(),
    },
  },
}));

const fs = (await import("fs")).default;
const attendanceService = await import("../services/attendanceImportService.js");

// --- 2. SETUP DATA DUMMY ---

const MOCK_CSV_CONTENT = `Company Name
Device Info
Period: From 2025/10/01 To 2025/10/31
User ID,Full Name,Date/Time
101,Budi Santoso,2025/10/01 07:50:00
101,Budi Santoso,2025/10/01 17:10:00
102,Siti Aminah,2025/10/01 08:15:00
102,Siti Aminah,2025/10/01 16:00:00
`;

const createMockStream = (content = MOCK_CSV_CONTENT) => {
  const s = new Readable();
  s.push(content);
  s.push(null);
  return s;
};

const mockConn = {
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

describe("attendanceImportService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default implementation
    fs.createReadStream.mockImplementation(() => createMockStream());

    mockConn.query.mockImplementation(async (sql, params) => {
      if (sql.includes("SELECT username FROM users")) {
        return [
          [{ username: "Budi Santoso" }, { username: "Siti Aminah" }, { username: "Joko Widodo" }],
        ];
      }
      if (sql.includes("SELECT id FROM attendance_logs")) {
        return [[{ id: 999 }]];
      }
      return [{ insertId: 123, affectedRows: 1 }];
    });
  });

  // ==========================================================
  // TEST CASES
  // ==========================================================

  test("Scenario 1: Full Import Success (Normal Mode)", async () => {
    const onProgress = jest.fn();
    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "dummy.csv",
      1,
      "file_asli.csv",
      onProgress,
      false
    );

    expect(result.stats.success).toBe(2);
    expect(result.errors).toHaveLength(0);

    expect(mockConn.beginTransaction).toHaveBeenCalled();
    expect(mockConn.commit).toHaveBeenCalled();
    expect(mockConn.rollback).not.toHaveBeenCalled();

    const calls = mockConn.query.mock.calls.filter((call) =>
      call[0].includes("INSERT INTO attendance_logs")
    );

    const budiCall = calls.find((c) => c[1][0] === "Budi Santoso");
    expect(budiCall).toBeDefined();
    expect(budiCall[1][2]).toBe("07:50:00"); // Check In

    expect(budiCall[1][6]).toContain("Import: file_asli.csv");
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

    if (result.logSummary.includes("[SIMULASI VALID]")) {
      expect(result.logSummary).toContain("[SIMULASI VALID]");
    } else {
      expect(mockConn.rollback).toHaveBeenCalled();
    }

    expect(result.stats.success).toBe(2);
    expect(mockConn.rollback).toHaveBeenCalled();
  });

  test("Scenario 3: Parsing Date Period Failure", async () => {
    const BAD_CSV = `Header 1\nHeader 2\nHeader 3 (No Date)\nUser ID,Name,Date/Time\n`;
    fs.createReadStream.mockImplementation(() => createMockStream(BAD_CSV));

    await expect(attendanceService.processAttendanceImport(mockConn, "bad.csv", 1)).rejects.toThrow(
      "Gagal mendeteksi periode tanggal"
    );
  });

  test("Scenario 4: Handling Database Error (Row Level)", async () => {
    mockConn.query
      .mockResolvedValueOnce([[{ username: "Budi Santoso" }, { username: "Siti Aminah" }]])
      .mockRejectedValueOnce(new Error("DB Connection Lost"));

    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "dummy.csv",
      1,
      "file_asli.csv",
      null,
      false
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("DB Connection Lost");
  });

  test("Scenario 5: Handling Fatal Database Error (Top Level)", async () => {
    mockConn.beginTransaction.mockRejectedValueOnce(new Error("Transaction Failed"));

    await expect(
      attendanceService.processAttendanceImport(mockConn, "dummy.csv", 1)
    ).rejects.toThrow("Transaction Failed");
  });

  test("Scenario 6: Custom Column Mapping (Non-Standard CSV)", async () => {
    // Mock Custom CSV
    const CUSTOM_CSV = `Metadata...
Metadata...
From 2025/11/01 To 2025/11/30
Nomor Pegawai,Nama Lengkap,Waktu Absen
103,Joko Widodo,2025/11/01 08:00:00
103,Joko Widodo,2025/11/01 17:00:00
`;
    fs.createReadStream.mockImplementation(() => createMockStream(CUSTOM_CSV));

    // Definisikan Mapping
    const mapping = { id: "Nomor Pegawai", name: "Nama Lengkap", time: "Waktu Absen" };

    const result = await attendanceService.processAttendanceImport(
      mockConn,
      "custom.csv",
      1,
      "custom.csv",
      null,
      false,
      mapping // [NEW] Pass mapping argument
    );

    expect(result.stats.success).toBe(1); // 1 Hari (Joko Widodo)

    // Validasi DB Insert menggunakan nama dari mapping
    const calls = mockConn.query.mock.calls.filter((call) =>
      call[0].includes("INSERT INTO attendance_logs")
    );
    const jokoCall = calls.find((c) => c[1][0] === "Joko Widodo");

    expect(jokoCall).toBeDefined();
    expect(jokoCall[1][2]).toBe("08:00:00"); // Check In Valid
  });
});
