// backend/tests/repositories/stockMovementRepository.test.js
import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { getStockHistory, getBatchLogs } from "../../repositories/stockMovementRepository.js";

describe("stockMovementRepository", () => {
  let mockConnection;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn(),
    };
  });

  describe("getStockHistory", () => {
    test("harus menjalankan query COUNT dan SELECT minimal dengan productId, limit, dan offset", async () => {
      const mockRows = [{ id: 1, quantity: 5, movement_type: "INBOUND" }];
      mockConnection.query
        .mockResolvedValueOnce([[{ total: 12 }], []])
        .mockResolvedValueOnce([mockRows, []]);

      const result = await getStockHistory(mockConnection, {
        productId: 99,
        movementType: "all",
        locationId: "all",
        limit: 15,
        offset: 30,
      });

      expect(result).toEqual({ rows: mockRows, total: 12 });
      expect(mockConnection.query).toHaveBeenCalledTimes(2);

      const [countSql, countParams] = mockConnection.query.mock.calls[0];
      const [dataSql, dataParams] = mockConnection.query.mock.calls[1];

      expect(countSql).toContain("WHERE sm.product_id = ?");
      expect(countSql).not.toContain("sm.movement_type = ?");
      expect(countSql).not.toContain("sm.from_location_id = ?");
      expect(countParams).toEqual([99]);

      expect(dataSql).toContain("ORDER BY sm.created_at DESC");
      expect(dataSql).toContain("LIMIT ? OFFSET ?");
      expect(dataParams).toEqual([99, 15, 30]);
    });

    test("harus menyusun filter lengkap (movementType, rentang tanggal, locationId, user) dengan urutan parameter identik", async () => {
      mockConnection.query
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([[{ id: 5 }], []]);

      await getStockHistory(mockConnection, {
        productId: 10,
        movementType: "TRANSFER",
        startDate: "2026-11-01",
        endDate: "2026-11-20",
        locationId: 4,
        user: "budi",
        limit: 20,
        offset: 0,
      });

      const [countSql, countParams] = mockConnection.query.mock.calls[0];
      const [dataSql, dataParams] = mockConnection.query.mock.calls[1];

      expect(countSql).toContain("sm.movement_type = ?");
      expect(countSql).toContain("DATE(sm.created_at) BETWEEN ? AND ?");
      expect(countSql).toContain("(sm.from_location_id = ? OR sm.to_location_id = ?)");
      expect(countSql).toContain("u.username LIKE ?");

      const expectedFilterParams = [10, "TRANSFER", "2026-11-01", "2026-11-20", 4, 4, "%budi%"];
      expect(countParams).toEqual(expectedFilterParams);
      expect(dataSql).toContain("DATE(sm.created_at) BETWEEN ? AND ?");
      expect(dataParams).toEqual([...expectedFilterParams, 20, 0]);
    });

    test("harus mendukung variasi filter startDate-only dan endDate-only serta default total 0", async () => {
      mockConnection.query
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[], []])
        .mockResolvedValueOnce([[{ total: 0 }], []])
        .mockResolvedValueOnce([[], []]);

      const resStart = await getStockHistory(mockConnection, {
        productId: 1,
        startDate: "2026-11-01",
      });
      expect(resStart).toEqual({ rows: [], total: 0 });
      expect(mockConnection.query.mock.calls[0][0]).toContain("DATE(sm.created_at) >= ?");
      expect(mockConnection.query.mock.calls[0][1]).toEqual([1, "2026-11-01"]);

      await getStockHistory(mockConnection, {
        productId: 1,
        endDate: "2026-11-20",
      });
      expect(mockConnection.query.mock.calls[2][0]).toContain("DATE(sm.created_at) <= ?");
      expect(mockConnection.query.mock.calls[2][1]).toEqual([1, "2026-11-20"]);
    });
  });

  describe("getBatchLogs", () => {
    test("harus menyusun filter dasar rentang tanggal tanpa filter opsional", async () => {
      const mockRows = [{ id: 100, sku: "SKU-1" }];
      mockConnection.query
        .mockResolvedValueOnce([[{ total: 1 }], []])
        .mockResolvedValueOnce([mockRows, []]);

      const result = await getBatchLogs(mockConnection, {
        startDate: "2026-11-01",
        endDate: "2026-11-20",
        limit: 50,
        offset: 0,
      });

      expect(result).toEqual({ rows: mockRows, total: 1 });
      const [countSql, countParams] = mockConnection.query.mock.calls[0];
      const [dataSql, dataParams] = mockConnection.query.mock.calls[1];

      expect(countSql).toContain("sm.created_at BETWEEN ? AND ?");
      expect(countParams).toEqual(["2026-11-01", "2026-11-20 23:59:59"]);
      expect(dataSql).toContain("ORDER BY sm.created_at DESC");
      expect(dataSql).toContain("LIMIT ? OFFSET ?");
      expect(dataParams).toEqual(["2026-11-01", "2026-11-20 23:59:59", 50, 0]);
    });

    test("harus menyusun filter lengkap termasuk TriState include/exclude, productName, userId, dan notes", async () => {
      mockConnection.query
        .mockResolvedValueOnce([[{ total: 3 }], []])
        .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }], []]);

      await getBatchLogs(mockConnection, {
        startDate: "2026-11-01",
        endDate: "2026-11-20",
        productName: "Kabel",
        movementType: { include: ["TRANSFER"], exclude: ["OPNAME"] },
        sourceLocation: [1, 2],
        destinationLocation: { exclude: [9] },
        userId: "andi",
        notes: "urgent",
        limit: 25,
        offset: 50,
      });

      const [countSql, countParams] = mockConnection.query.mock.calls[0];
      const [, dataParams] = mockConnection.query.mock.calls[1];

      expect(countSql).toContain("(p.name LIKE ? OR p.sku LIKE ?)");
      expect(countSql).toContain("sm.movement_type IN (?)");
      expect(countSql).toContain("sm.movement_type NOT IN (?)");
      expect(countSql).toContain("sm.from_location_id IN (?)");
      expect(countSql).toContain("sm.to_location_id NOT IN (?)");
      expect(countSql).toContain("u.username LIKE ?");
      expect(countSql).toContain("sm.notes LIKE ?");

      const expectedParams = [
        "2026-11-01",
        "2026-11-20 23:59:59",
        "%Kabel%",
        "%Kabel%",
        ["TRANSFER"],
        ["OPNAME"],
        [1, 2],
        [9],
        "%andi%",
        "%urgent%",
      ];
      expect(countParams).toEqual(expectedParams);
      expect(dataParams).toEqual([...expectedParams, 25, 50]);
    });
  });
});
