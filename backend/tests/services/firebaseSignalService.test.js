import { jest } from "@jest/globals";

const mockSet = jest.fn().mockResolvedValue(true);
const mockRef = jest.fn(() => ({
  set: mockSet,
}));

jest.unstable_mockModule("../../config/firebase.js", () => ({
  isInitialized: true,
  firebaseDb: {
    ref: mockRef,
  },
}));

jest.unstable_mockModule("../../utils/logger.js", () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

// Dynamic import for ESM test isolation
const { emitUserSignal, emitSharedTaskSignal, signals } = await import("../../services/firebaseSignalService.js");
const logger = (await import("../../utils/logger.js")).default;

describe("firebaseSignalService & signals facade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("emitUserSignal", () => {
    it("should sanitize user ID and emit signal to correct path", async () => {
      const res = await emitUserSignal("user.1#test");
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/users/user_1_test");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_NOTIFICATIONS", last_updated: expect.any(Number) })
      );
    });
  });

  describe("emitSharedTaskSignal", () => {
    it("should sanitize permission name and emit to correct path", async () => {
      const res = await emitSharedTaskSignal("WMS.DASHBOARD", "REFRESH_STOCK");
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/WMS_DASHBOARD");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_STOCK" })
      );
    });
  });

  describe("signals facade", () => {
    it("should emit refreshStock signal", async () => {
      const res = await signals.refreshStock();
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/WMS_DASHBOARD");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_STOCK" })
      );
    });

    it("should emit refreshPicking signal", async () => {
      const res = await signals.refreshPicking();
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/PICKING_LIST");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_PICKING" })
      );
    });

    it("should emit refreshRequests signal", async () => {
      const res = await signals.refreshRequests();
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/STOCK_REQUESTS");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_REQUESTS" })
      );
    });

    it("should emit userNotifications signal", async () => {
      const res = await signals.userNotifications(42);
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/users/42");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_NOTIFICATIONS" })
      );
    });

    it("should emit sharedTaskNotifications signal", async () => {
      const res = await signals.sharedTaskNotifications("WMS_ADMIN");
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/WMS_ADMIN");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_NOTIFICATIONS" })
      );
    });

    it("should emit refreshProducts signal", async () => {
      const res = await signals.refreshProducts();
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/MASTER_DATA");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "REFRESH_PRODUCTS" })
      );
    });

    it("should emit forceLogout signal with targetId", async () => {
      const res = await signals.forceLogout(99);
      expect(res).toBe(true);
      expect(mockRef).toHaveBeenCalledWith("signals/permissions/AUTH_SECURITY");
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ action: "FORCE_LOGOUT_99" })
      );
    });

    it("should catch unexpected errors and log without throwing", async () => {
      mockSet.mockRejectedValueOnce(new Error("Network timeout"));
      const res = await signals.refreshStock();
      expect(res).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
