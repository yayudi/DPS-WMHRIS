// backend/services/salesChannelService.js
import * as salesChannelRepo from "../repositories/salesChannelRepository.js";
import Logger from "../utils/logger.js";
import { signals } from "./firebaseSignalService.js";
import cache from "../config/cache.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";

/**
 * @param {boolean} [onlyActive=false]
 * @returns {Promise<any>}
 */
export const getAllChannels = async (onlyActive = false) => {
  const cacheKey = onlyActive ? "MASTER_SALES_CHANNELS_ACTIVE" : "MASTER_SALES_CHANNELS_ALL";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const data = await withConnection(async (connection) => {
      return await salesChannelRepo.getAll(connection, onlyActive);
    });
    cache.set(cacheKey, data);
    return data;
  } catch (error) {
    Logger.error("Error in getAllChannels", error, "SALES_CHANNEL_SERVICE");
    throw error;
  }
};

/**
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export const getChannelById = async (id) => {
  try {
    return await withConnection(async (connection) => {
      const channel = await salesChannelRepo.getById(connection, id);
      if (!channel) {
        throw new Error("Saluran penjualan tidak ditemukan.");
      }
      return channel;
    });
  } catch (error) {
    Logger.error("Error in getChannelById", error, "SALES_CHANNEL_SERVICE");
    throw error;
  }
};

/**
 * @param {any} channelData
 * @param {number|string} [_]
 * @returns {Promise<any>}
 */
export const createChannel = async (channelData, _) => {
  try {
    if (!channelData.name || !channelData.platform) {
      throw new Error("Nama dan Platform wajib diisi.");
    }

    const newId = await withTransaction(async (connection) => {
      return await salesChannelRepo.create(connection, channelData);
    });

    cache.del(["MASTER_SALES_CHANNELS_ACTIVE", "MASTER_SALES_CHANNELS_ALL"]);
    signals.refreshChannels();
    return newId;
  } catch (error) {
    Logger.error("Error in createChannel", error, "SALES_CHANNEL_SERVICE");
    throw error;
  }
};

/**
 * @param {number|string} id
 * @param {any} channelData
 * @param {number|string} [_]
 * @returns {Promise<any>}
 */
export const updateChannel = async (id, channelData, _) => {
  try {
    if (!channelData.name || !channelData.platform) {
      throw new Error("Nama dan Platform wajib diisi.");
    }

    const success = await withTransaction(async (connection) => {
      const existing = await salesChannelRepo.getById(connection, id);
      if (!existing) {
        throw new Error("Saluran penjualan tidak ditemukan.");
      }
      return await salesChannelRepo.update(connection, id, channelData);
    });

    cache.del(["MASTER_SALES_CHANNELS_ACTIVE", "MASTER_SALES_CHANNELS_ALL"]);
    signals.refreshChannels();
    return success;
  } catch (error) {
    Logger.error("Error in updateChannel", error, "SALES_CHANNEL_SERVICE");
    throw error;
  }
};

/**
 * @param {number|string} id
 * @param {number|string} [_]
 * @returns {Promise<any>}
 */
export const deleteChannel = async (id, _) => {
  try {
    const success = await withTransaction(async (connection) => {
      const existing = await salesChannelRepo.getById(connection, id);
      if (!existing) {
        throw new Error("Saluran penjualan tidak ditemukan.");
      }
      return await salesChannelRepo.remove(connection, id);
    });

    cache.del(["MASTER_SALES_CHANNELS_ACTIVE", "MASTER_SALES_CHANNELS_ALL"]);
    signals.refreshChannels();
    return success;
  } catch (error) {
    Logger.error("Error in deleteChannel", error, "SALES_CHANNEL_SERVICE");
    throw error;
  }
};
