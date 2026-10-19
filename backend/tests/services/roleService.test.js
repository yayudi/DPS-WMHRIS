// backend/tests/services/roleService.test.js
import { describe, test, expect, jest, beforeEach } from "@jest/globals";

const mockRoleRepo = {
  getRoles: jest.fn(),
  getPermissions: jest.fn(),
  getRolePermissions: jest.fn(),
  deleteRolePermissions: jest.fn(),
  insertRolePermissions: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
};

const mockSystemLogRepo = {
  createLog: jest.fn().mockResolvedValue(true),
};

const mockSignals = {
  refreshRoles: jest.fn(),
};

const mockCache = new Map();
const mockCacheModule = {
  has: jest.fn((key) => mockCache.has(key)),
  get: jest.fn((key) => mockCache.get(key)),
  set: jest.fn((key, val) => mockCache.set(key, val)),
  del: jest.fn((key) => mockCache.delete(key)),
};

const mockConnection = {
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
};

const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConnection),
};

await jest.unstable_mockModule("../../config/db.js", () => ({ default: mockDb }));
await jest.unstable_mockModule("../../config/cache.js", () => ({ default: mockCacheModule }));
await jest.unstable_mockModule("../../repositories/roleRepository.js", () => mockRoleRepo);
await jest.unstable_mockModule("../../repositories/systemLogRepository.js", () => mockSystemLogRepo);
await jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: mockSignals,
}));

const {
  updateRolePermissionsService,
} = await import("../../services/roleService.js");

describe("roleService with Transaction Wrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.clear();
    mockDb.getConnection.mockResolvedValue(mockConnection);
  });

  describe("updateRolePermissionsService", () => {
    test("harus sukses memperbarui permission peran dalam transaksi tunggal", async () => {
      mockRoleRepo.deleteRolePermissions.mockResolvedValue(true);
      mockRoleRepo.insertRolePermissions.mockResolvedValue(true);

      await updateRolePermissionsService(1, [10, 20, 30], 99, "127.0.0.1", "Jest");

      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockRoleRepo.deleteRolePermissions).toHaveBeenCalledWith(mockConnection, 1);
      expect(mockRoleRepo.insertRolePermissions).toHaveBeenCalledWith(mockConnection, 1, [10, 20, 30]);
      expect(mockSystemLogRepo.createLog).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshRoles).toHaveBeenCalledTimes(1);
      expect(mockCacheModule.del).toHaveBeenCalledWith("MASTER_ROLES");
    });

    test("harus melempar AppError 400 jika ER_NO_REFERENCED_ROW_2 terjadi", async () => {
      const foreignKeyError = new Error("Foreign key fail");
      foreignKeyError.code = "ER_NO_REFERENCED_ROW_2";
      mockRoleRepo.deleteRolePermissions.mockRejectedValue(foreignKeyError);

      await expect(
        updateRolePermissionsService(1, [999], 99, "127.0.0.1", "Jest")
      ).rejects.toThrow("Satu atau lebih ID izin atau peran tidak valid.");

      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });
});
