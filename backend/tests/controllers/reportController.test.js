// backend/tests/controllers/reportController.test.js
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

await jest.unstable_mockModule("../../config/db.js", () => ({
  default: mockDb,
}));

await jest.unstable_mockModule("../../repositories/reportRepository.js", () => ({
  getReportFilters: jest.fn(),
}));

await jest.unstable_mockModule("../../repositories/jobRepository.js", () => ({
  createExportJob: jest.fn(),
}));

await jest.unstable_mockModule("../../utils/dbUtils.js", () => ({
  withConnection: jest.fn(),
}));

const { getUserExportJobs } = await import("../../controllers/reportController.js");

describe("reportController.getUserExportJobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("normalizes filters to Object whether DB returns JSON string or pre-parsed Object", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 1,
          status: "COMPLETED",
          file_path: "Master_Produk_1.csv",
          error_message: null,
          created_at: "2026-11-17T00:00:00Z",
          filters: { exportType: "PRODUCT_MASTER", format: "csv" },
        },
        {
          id: 2,
          status: "COMPLETED",
          file_path: "Master_Paket_2.xlsx",
          error_message: null,
          created_at: "2026-11-17T00:01:00Z",
          filters: '{"exportType":"EXPORT_PACKAGES","format":"xlsx"}',
        },
        {
          id: 3,
          status: "PENDING",
          file_path: null,
          error_message: null,
          created_at: "2026-11-17T00:02:00Z",
          filters: null,
        },
      ],
    ]);

    const req = {
      user: { id: 10 },
      protocol: "https",
      get: jest.fn().mockReturnValue("api.example.com"),
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await getUserExportJobs(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: 1,
          type: "PRODUCT_MASTER",
          filters: { exportType: "PRODUCT_MASTER", format: "csv" },
          download_url: "https://api.example.com/uploads/exports/stocks/Master_Produk_1.csv",
        }),
        expect.objectContaining({
          id: 2,
          type: "EXPORT_PACKAGES",
          filters: { exportType: "EXPORT_PACKAGES", format: "xlsx" },
          download_url: "https://api.example.com/uploads/exports/stocks/Master_Paket_2.xlsx",
        }),
        expect.objectContaining({
          id: 3,
          type: "STOCK_REPORT",
          filters: {},
        }),
      ],
    });
  });
});
