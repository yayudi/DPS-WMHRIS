// backend/tests/services/salesChannelService.test.js
import { describe, test, expect, jest, beforeEach } from "@jest/globals";

const mockRepo = {
  getAll: jest.fn(),
  getById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockSignals = {
  refreshChannels: jest.fn(),
};

const mockCache = new Map();
const mockCacheModule = {
  has: jest.fn((key) => mockCache.has(key)),
  get: jest.fn((key) => mockCache.get(key)),
  set: jest.fn((key, val) => mockCache.set(key, val)),
  del: jest.fn((keys) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    arr.forEach((k) => mockCache.delete(k));
  }),
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
await jest.unstable_mockModule("../../repositories/salesChannelRepository.js", () => mockRepo);
await jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: mockSignals,
}));

const {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
} = await import("../../services/salesChannelService.js");

describe("salesChannelService with Transaction Wrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.clear();
    mockDb.getConnection.mockResolvedValue(mockConnection);
  });

  describe("getAllChannels", () => {
    test("harus mengambil dari cache jika sudah ada", async () => {
      mockCache.set("MASTER_SALES_CHANNELS_ALL", [{ id: 1, name: "Shopee" }]);

      const result = await getAllChannels(false);

      expect(result).toEqual([{ id: 1, name: "Shopee" }]);
      expect(mockDb.getConnection).not.toHaveBeenCalled();
    });

    test("harus query DB dan simpan ke cache jika cache miss", async () => {
      mockRepo.getAll.mockResolvedValue([{ id: 2, name: "Tokopedia" }]);

      const result = await getAllChannels(false);

      expect(result).toEqual([{ id: 2, name: "Tokopedia" }]);
      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(mockCache.get("MASTER_SALES_CHANNELS_ALL")).toEqual([{ id: 2, name: "Tokopedia" }]);
    });
  });

  describe("getChannelById", () => {
    test("harus melempar error jika saluran tidak ditemukan", async () => {
      mockRepo.getById.mockResolvedValue(null);

      await expect(getChannelById(99)).rejects.toThrow("Saluran penjualan tidak ditemukan.");
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test("harus mengembalikan channel jika ditemukan", async () => {
      mockRepo.getById.mockResolvedValue({ id: 1, name: "TikTok Shop" });

      const result = await getChannelById(1);
      expect(result).toEqual({ id: 1, name: "TikTok Shop" });
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("createChannel", () => {
    test("harus validasi name dan platform", async () => {
      await expect(createChannel({ name: "" })).rejects.toThrow("Nama dan Platform wajib diisi.");
      expect(mockDb.getConnection).not.toHaveBeenCalled();
    });

    test("harus berhasil create dalam transaksi, clear cache, dan kirim signal", async () => {
      mockRepo.create.mockResolvedValue(101);

      const result = await createChannel({ name: "Lazada", platform: "MARKETPLACE" });

      expect(result).toBe(101);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshChannels).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateChannel", () => {
    test("harus rollback jika channel yang diupdate tidak ditemukan", async () => {
      mockRepo.getById.mockResolvedValue(null);

      await expect(
        updateChannel(999, { name: "Updated Name", platform: "WEB" })
      ).rejects.toThrow("Saluran penjualan tidak ditemukan.");

      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });

    test("harus sukses update channel dan invalidate cache", async () => {
      mockRepo.getById.mockResolvedValue({ id: 1, name: "Old Name", platform: "WEB" });
      mockRepo.update.mockResolvedValue(true);

      const result = await updateChannel(1, { name: "New Name", platform: "WEB" });

      expect(result).toBe(true);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshChannels).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteChannel", () => {
    test("harus sukses delete channel dalam transaksi", async () => {
      mockRepo.getById.mockResolvedValue({ id: 1, name: "To Delete" });
      mockRepo.remove.mockResolvedValue(true);

      const result = await deleteChannel(1);

      expect(result).toBe(true);
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(mockSignals.refreshChannels).toHaveBeenCalledTimes(1);
    });
  });
});
