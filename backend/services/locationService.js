// backend/services/locationService.js
import * as locationRepository from "../repositories/locationRepository.js";
import { createLog } from "../repositories/systemLogRepository.js";
import AppError from "../utils/AppError.js";
import { signals } from "./firebaseSignalService.js";
import cache from "../config/cache.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";

/**
 * Menambahkan lokasi baru beserta audit log secara atomik
 * @param {object} data - { code, building, floor, name, purpose }
 * @param {object|null} [userContext] - { userId, ip, userAgent }
 * @param {import('mysql2/promise').Connection|null} [existingConnection]
 * @returns {Promise<number>} ID lokasi baru
 * @throws {Error} Jika validasi gagal
 */
export const addLocation = async (data, userContext = null, existingConnection = null) => {
  const { code, building, purpose } = data;

  // 1. Business Validation
  if (!code || !building || !purpose) {
    throw new AppError("Code, Building, and Purpose are required.", 400, "VALIDATION_ERROR");
  }

  return withTransaction(async (connection) => {
    // 2. Check Duplicate
    const existingId = await locationRepository.getIdByCode(connection, code);
    if (existingId) {
      throw new AppError("Location code already exists.", 400, "VALIDATION_ERROR");
    }

    // 3. Insert Data
    const newLocationId = await locationRepository.createLocation(connection, data);

    // 4. Audit Log
    if (userContext?.userId) {
      await createLog(connection, {
        userId: userContext.userId,
        action: "CREATE",
        targetType: "LOCATION",
        targetId: String(newLocationId),
        changes: data,
        ip: userContext.ip,
        userAgent: userContext.userAgent,
      });
    }

    cache.del("MASTER_LOCATIONS");
    signals.refreshLocations();
    return newLocationId;
  }, existingConnection);
};

/**
 * @returns {Promise<any>}
 */
export const getAllLocations = async () => {
  const cacheKey = "MASTER_LOCATIONS";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  return withConnection(async (connection) => {
    const data = await locationRepository.getAllLocations(connection);
    cache.set(cacheKey, data);
    return data;
  });
};

/**
 * @param {number|string} locationId
 * @returns {Promise<any>}
 */
export const getStockSample = async (locationId) => {
  return withConnection(async (connection) => {
    return locationRepository.getStockSample(connection, locationId);
  });
};

/**
 * @param {number|string} id
 * @param {any} data
 * @param {object|null} [userContext] - { userId, ip, userAgent }
 * @param {import('mysql2/promise').Connection|null} [existingConnection]
 * @returns {Promise<any>}
 */
export const updateLocation = async (id, data, userContext = null, existingConnection = null) => {
  const { code, building, purpose } = data;
  if (!code || !building || !purpose) {
    throw new AppError("Code, Building, and Purpose are required.", 400, "VALIDATION_ERROR");
  }

  return withTransaction(async (connection) => {
    try {
      const isUpdated = await locationRepository.updateLocation(connection, id, data);
      if (!isUpdated) {
        throw new AppError("Location not found.", 404, "NOT_FOUND");
      }

      if (userContext?.userId) {
        await createLog(connection, {
          userId: userContext.userId,
          action: "UPDATE",
          targetType: "LOCATION",
          targetId: String(id),
          changes: data,
          ip: userContext.ip,
          userAgent: userContext.userAgent,
        });
      }

      cache.del("MASTER_LOCATIONS");
      signals.refreshLocations();
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new AppError("Location code already exists.", 409, "VALIDATION_ERROR");
      }
      throw error;
    }
  }, existingConnection);
};

/**
 * @param {number|string} id
 * @param {object|null} [userContext] - { userId, ip, userAgent }
 * @param {import('mysql2/promise').Connection|null} [existingConnection]
 * @returns {Promise<any>}
 */
export const deleteLocation = async (id, userContext = null, existingConnection = null) => {
  return withTransaction(async (connection) => {
    try {
      const isDeleted = await locationRepository.deleteLocation(connection, id);
      if (!isDeleted) {
        throw new AppError("Location not found.", 404, "NOT_FOUND");
      }

      if (userContext?.userId) {
        await createLog(connection, {
          userId: userContext.userId,
          action: "DELETE",
          targetType: "LOCATION",
          targetId: String(id),
          changes: { note: "Deleted Location" },
          ip: userContext.ip,
          userAgent: userContext.userAgent,
        });
      }

      cache.del("MASTER_LOCATIONS");
      signals.refreshLocations();
    } catch (error) {
      if (error.code === "ER_ROW_IS_REFERENCED_2") {
        throw new AppError(
          "Location is still in use by stock. Please clear stock first.",
          400,
          "VALIDATION_ERROR",
        );
      }
      throw error;
    }
  }, existingConnection);
};
