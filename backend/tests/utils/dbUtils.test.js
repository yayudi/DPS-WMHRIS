// backend/tests/utils/dbUtils.test.js
import { describe, test, expect, jest, beforeEach } from "@jest/globals";

const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

const mockDb = {
  getConnection: jest.fn(),
};

await jest.unstable_mockModule("../../config/db.js", () => ({
  default: mockDb,
}));

const { withTransaction, withConnection } = await import("../../utils/dbUtils.js");

describe("dbUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.getConnection.mockResolvedValue(mockConnection);
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
  });

  describe("withTransaction", () => {
    test("harus menjalankan transaksi secara sukses (beginTransaction -> callback -> commit -> release)", async () => {
      const mockResult = { id: 10, name: "Channel A" };
      const callback = jest.fn().mockResolvedValue(mockResult);

      const result = await withTransaction(callback);

      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.rollback).not.toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });

    test("harus melakukan rollback dan me-rethrow error jika callback gagal", async () => {
      const dbError = new Error("Unique constraint violation");
      const callback = jest.fn().mockRejectedValue(dbError);

      await expect(withTransaction(callback)).rejects.toThrow("Unique constraint violation");

      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test("harus menggunakan existingConnection tanpa beginTransaction/commit/rollback/release", async () => {
      const customExistingConn = {
        query: jest.fn(),
      };
      const callback = jest.fn().mockResolvedValue("nested-success");

      const result = await withTransaction(callback, customExistingConn);

      expect(result).toBe("nested-success");
      expect(mockDb.getConnection).not.toHaveBeenCalled();
      expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockConnection.release).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(customExistingConn);
    });
  });

  describe("withConnection", () => {
    test("harus mengeksekusi callback dan me-release connection setelah selesai", async () => {
      const callback = jest.fn().mockResolvedValue(["data1", "data2"]);

      const result = await withConnection(callback);

      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockConnection);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(result).toEqual(["data1", "data2"]);
    });

    test("harus tetap me-release connection jika callback throw error", async () => {
      const error = new Error("Query timeout");
      const callback = jest.fn().mockRejectedValue(error);

      await expect(withConnection(callback)).rejects.toThrow("Query timeout");

      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test("harus menggunakan existingConnection tanpa acquire atau release baru", async () => {
      const existingConn = { query: jest.fn() };
      const callback = jest.fn().mockResolvedValue("read-ok");

      const result = await withConnection(callback, existingConn);

      expect(result).toBe("read-ok");
      expect(mockDb.getConnection).not.toHaveBeenCalled();
      expect(mockConnection.release).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(existingConn);
    });
  });
});
