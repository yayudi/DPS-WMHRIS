import Logger from "../utils/logger.js";
import * as categoryRepo from "../repositories/categoryRepository.js";
import { emitSharedTaskSignal } from "./firebaseSignalService.js";
import cache from "../config/cache.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";

/**
 * Mengambil semua kategori aktif
 * @returns {Promise<Array>}
 */
export const getAllCategories = async () => {
  const cacheKey = "MASTER_CATEGORIES";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  return withConnection(async (connection) => {
    const data = await categoryRepo.findAllCategories(connection);
    cache.set(cacheKey, data);
    return data;
  });
};

/**
 * Membuat kategori baru
 * @param {string} name 
 * @returns {Promise<Object>}
 */
export const createCategory = async (name) => {
  return withTransaction(async (connection) => {
    try {
      const trimmedName = name.trim();
      const id = await categoryRepo.createCategory(connection, trimmedName);
      cache.del("MASTER_CATEGORIES");
      emitSharedTaskSignal("MASTER_DATA", "REFRESH_CATEGORIES").catch((e) =>
        Logger.error("Signal Error", e, "CATEGORY_SERVICE"),
      );
      return { id, name: trimmedName };
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        const customError = new Error("Nama kategori sudah ada");
        customError.code = "DUPLICATE_ENTRY";
        throw customError;
      }
      throw error;
    }
  });
};

/**
 * Mengupdate kategori
 * @param {string} id 
 * @param {string} name 
 */
export const updateCategory = async (id, name) => {
  return withTransaction(async (connection) => {
    const trimmedName = name.trim();
    const affected = await categoryRepo.updateCategory(connection, id, trimmedName);
    if (affected === 0) {
      const err = new Error("Kategori tidak ditemukan");
      err.code = "NOT_FOUND";
      throw err;
    }
    cache.del("MASTER_CATEGORIES");
    emitSharedTaskSignal("MASTER_DATA", "REFRESH_CATEGORIES").catch((e) =>
      Logger.error("Signal Error", e, "CATEGORY_SERVICE"),
    );
  });
};

/**
 * Menghapus kategori (soft delete)
 * @param {string} id 
 */
export const deleteCategory = async (id) => {
  return withTransaction(async (connection) => {
    const affected = await categoryRepo.deleteCategory(connection, id);
    if (affected === 0) {
      const err = new Error("Kategori tidak ditemukan");
      err.code = "NOT_FOUND";
      throw err;
    }
    cache.del("MASTER_CATEGORIES");
    emitSharedTaskSignal("MASTER_DATA", "REFRESH_CATEGORIES").catch((e) =>
      Logger.error("Signal Error", e, "CATEGORY_SERVICE"),
    );
  });
};
