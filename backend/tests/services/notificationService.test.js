import { jest } from "@jest/globals";

// 1. MOCKING LAYER
// Mock repository
const mockNotificationRepo = {
  getRecentPending: jest.fn(),
  getAll: jest.fn(),
  markAsDone: jest.fn(),
  markAllAsDone: jest.fn(),
  getPreferences: jest.fn(),
  upsertPreference: jest.fn(),
};

// Mock database connection
const mockConnection = {
  release: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
};

const mockDb = {
  getConnection: jest.fn().mockResolvedValue(mockConnection),
};

// Setup ESM Mocks sebelum dynamic import
await jest.unstable_mockModule("../../config/db.js", () => ({
  default: mockDb,
}));

await jest.unstable_mockModule(
  "../../repositories/notificationRepository.js",
  () => mockNotificationRepo,
);

await jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: {
    userNotifications: jest.fn(),
    sharedTaskNotifications: jest.fn(),
  },
}));

// 2. DYNAMIC IMPORT SERVICE (Module under test)
const {
  fetchRecentUnread,
  fetchAll,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  fetchPreferences,
  updatePreferences,
} = await import("../../services/notificationService.js");

describe("Notification Service", () => {
  const mockUserId = 1;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchRecentUnread", () => {
    it("should fetch recent unread notifications and parse JSON payloads", async () => {
      const mockData = [
        { id: 101, title: "Test Notif", action_payload: '{"url":"/wms"}' },
        { id: 102, title: "No Payload", action_payload: null },
      ];
      mockNotificationRepo.getRecentPending.mockResolvedValueOnce(mockData);

      const result = await fetchRecentUnread(mockUserId, 5);

      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(mockNotificationRepo.getRecentPending).toHaveBeenCalledWith(
        mockConnection,
        mockUserId,
        5,
      );
      expect(mockConnection.release).toHaveBeenCalledTimes(1);

      // Verify payload parsing
      expect(result).toHaveLength(2);
      expect(result[0].action_payload).toEqual({ url: "/wms" });
      expect(result[1].action_payload).toBeNull();
    });
  });

  describe("markNotificationAsRead", () => {
    it("should mark a specific notification as read and commit transaction", async () => {
      const notifId = 99;
      mockNotificationRepo.markAsDone.mockResolvedValueOnce(1); // 1 row affected

      const result = await markNotificationAsRead(notifId, mockUserId);

      expect(mockDb.getConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockNotificationRepo.markAsDone).toHaveBeenCalledWith(
        mockConnection,
        notifId,
        mockUserId,
      );
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it("should rollback transaction if error occurs", async () => {
      const notifId = 99;
      const error = new Error("DB Error");
      mockNotificationRepo.markAsDone.mockRejectedValueOnce(error);

      await expect(markNotificationAsRead(notifId, mockUserId)).rejects.toThrow("DB Error");

      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
      expect(mockConnection.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchPreferences", () => {
    it("should merge user preferences with default system preferences", async () => {
      const mockPrefsFromDb = [{ type: "HRIS", is_enabled: 0 }];
      mockNotificationRepo.getPreferences.mockResolvedValueOnce(mockPrefsFromDb);

      const result = await fetchPreferences(mockUserId);

      expect(mockNotificationRepo.getPreferences).toHaveBeenCalledWith(mockConnection, mockUserId);

      // Should contain defaults for WMS and SYSTEM
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          { type: "WMS", is_enabled: true },
          { type: "HRIS", is_enabled: false },
          { type: "SYSTEM", is_enabled: true },
        ]),
      );
    });
  });

  describe("updatePreferences", () => {
    it("should upsert multiple preferences within a transaction", async () => {
      const newPrefs = [
        { type: "WMS", is_enabled: false },
        { type: "SYSTEM", is_enabled: true },
      ];

      mockNotificationRepo.upsertPreference.mockResolvedValue(true);

      const result = await updatePreferences(mockUserId, newPrefs);

      expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockNotificationRepo.upsertPreference).toHaveBeenCalledTimes(2);
      expect(mockNotificationRepo.upsertPreference).toHaveBeenNthCalledWith(
        1,
        mockConnection,
        mockUserId,
        "WMS",
        false,
      );
      expect(mockNotificationRepo.upsertPreference).toHaveBeenNthCalledWith(
        2,
        mockConnection,
        mockUserId,
        "SYSTEM",
        true,
      );
      expect(mockConnection.commit).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });
  });
});
