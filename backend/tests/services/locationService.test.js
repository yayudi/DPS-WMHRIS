import { jest } from "@jest/globals";

const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(),
};

jest.unstable_mockModule("../../config/db.js", () => ({
  default: {
    getConnection: jest.fn(() => Promise.resolve(mockConnection)),
  },
}));

jest.unstable_mockModule("../../config/cache.js", () => {
  const store = new Map();
  return {
    default: {
      get: jest.fn((k) => store.get(k)),
      set: jest.fn((k, v) => store.set(k, v)),
      has: jest.fn((k) => store.has(k)),
      del: jest.fn((k) => store.delete(k)),
      clear: () => store.clear(),
    },
  };
});

jest.unstable_mockModule("../../repositories/locationRepository.js", () => ({
  getIdByCode: jest.fn(),
  createLocation: jest.fn(),
  getAllLocations: jest.fn(),
  getStockSample: jest.fn(),
  updateLocation: jest.fn(),
  deleteLocation: jest.fn(),
}));

jest.unstable_mockModule("../../repositories/systemLogRepository.js", () => ({
  createLog: jest.fn(),
}));

jest.unstable_mockModule("../../services/firebaseSignalService.js", () => ({
  signals: {
    refreshLocations: jest.fn(),
  },
}));

const locationService = await import("../../services/locationService.js");
const locationRepo = await import("../../repositories/locationRepository.js");
const systemLogRepo = await import("../../repositories/systemLogRepository.js");
const cache = (await import("../../config/cache.js")).default;
const { signals } = await import("../../services/firebaseSignalService.js");

describe("Location Service Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("addLocation", () => {
    test("Validation Error: Missing code, building, or purpose", async () => {
      await expect(locationService.addLocation({})).rejects.toThrow(
        "Code, Building, and Purpose are required."
      );
    });

    test("Duplicate Error: Code already exists", async () => {
      locationRepo.getIdByCode.mockResolvedValue(10);

      await expect(
        locationService.addLocation({ code: "A1-1", building: "Main", purpose: "DISPLAY" })
      ).rejects.toThrow("Location code already exists.");

      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test("Success: Create location with audit log and signal", async () => {
      locationRepo.getIdByCode.mockResolvedValue(null);
      locationRepo.createLocation.mockResolvedValue(15);

      const userContext = { userId: 9, ip: "127.0.0.1", userAgent: "Jest" };
      const newId = await locationService.addLocation(
        { code: "A1-1", building: "Main", floor: "1", name: "Rak 1", purpose: "DISPLAY" },
        userContext
      );

      expect(newId).toBe(15);
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(locationRepo.createLocation).toHaveBeenCalled();
      expect(systemLogRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          userId: 9,
          action: "CREATE",
          targetType: "LOCATION",
          targetId: "15",
        })
      );
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith("MASTER_LOCATIONS");
      expect(signals.refreshLocations).toHaveBeenCalled();
    });
  });

  describe("getAllLocations & getStockSample", () => {
    test("getAllLocations: Return from DB and set cache on cache miss", async () => {
      cache.has.mockReturnValue(false);
      locationRepo.getAllLocations.mockResolvedValue([{ id: 1, code: "LOC-1" }]);

      const result = await locationService.getAllLocations();
      expect(result).toEqual([{ id: 1, code: "LOC-1" }]);
      expect(cache.set).toHaveBeenCalledWith("MASTER_LOCATIONS", [{ id: 1, code: "LOC-1" }]);
    });

    test("getAllLocations: Return from cache on cache hit", async () => {
      cache.has.mockReturnValue(true);
      cache.get.mockReturnValue([{ id: 2, code: "CACHED" }]);

      const result = await locationService.getAllLocations();
      expect(result).toEqual([{ id: 2, code: "CACHED" }]);
      expect(locationRepo.getAllLocations).not.toHaveBeenCalled();
    });

    test("getStockSample: Return samples via connection", async () => {
      locationRepo.getStockSample.mockResolvedValue([{ sku: "SKU-1", quantity: 5 }]);
      const res = await locationService.getStockSample(1);
      expect(res).toEqual([{ sku: "SKU-1", quantity: 5 }]);
    });
  });

  describe("updateLocation", () => {
    test("Success: Updates location, logs audit, and refreshes cache", async () => {
      locationRepo.updateLocation.mockResolvedValue(true);
      const userContext = { userId: 5, ip: "127.0.0.1", userAgent: "Jest" };

      await locationService.updateLocation(
        1,
        { code: "A1-2", building: "Main", purpose: "DISPLAY" },
        userContext
      );

      expect(locationRepo.updateLocation).toHaveBeenCalled();
      expect(systemLogRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          userId: 5,
          action: "UPDATE",
          targetType: "LOCATION",
          targetId: "1",
        })
      );
      expect(cache.del).toHaveBeenCalledWith("MASTER_LOCATIONS");
      expect(signals.refreshLocations).toHaveBeenCalled();
    });

    test("Not Found: Throws error when location doesn't exist", async () => {
      locationRepo.updateLocation.mockResolvedValue(false);

      await expect(
        locationService.updateLocation(999, { code: "A1-2", building: "Main", purpose: "DISPLAY" })
      ).rejects.toThrow("Location not found.");
    });
  });

  describe("deleteLocation", () => {
    test("Success: Deletes location and logs audit", async () => {
      locationRepo.deleteLocation.mockResolvedValue(true);
      const userContext = { userId: 5, ip: "127.0.0.1", userAgent: "Jest" };

      await locationService.deleteLocation(1, userContext);

      expect(locationRepo.deleteLocation).toHaveBeenCalled();
      expect(systemLogRepo.createLog).toHaveBeenCalledWith(
        mockConnection,
        expect.objectContaining({
          userId: 5,
          action: "DELETE",
          targetType: "LOCATION",
          targetId: "1",
        })
      );
      expect(cache.del).toHaveBeenCalledWith("MASTER_LOCATIONS");
      expect(signals.refreshLocations).toHaveBeenCalled();
    });

    test("In Use Error: ER_ROW_IS_REFERENCED_2", async () => {
      const err = new Error("Foreign Key");
      err.code = "ER_ROW_IS_REFERENCED_2";
      locationRepo.deleteLocation.mockRejectedValue(err);

      await expect(locationService.deleteLocation(1)).rejects.toThrow(
        "Location is still in use by stock. Please clear stock first."
      );
    });
  });
});
