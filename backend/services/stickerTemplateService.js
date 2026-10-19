import * as repo from "../repositories/stickerTemplateRepository.js";
import { emitSharedTaskSignal } from "./firebaseSignalService.js";
import cache from "../config/cache.js";
import Logger from "../utils/logger.js";
import { withConnection, withTransaction } from "../utils/dbUtils.js";

/**
 * Mendapatkan semua template
 * @returns {Promise<Array>}
 */
export const fetchAllTemplates = async () => {
  const cacheKey = "MASTER_STICKER_TEMPLATES";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const templates = await withConnection(async (connection) => {
    return await repo.getAllTemplates(connection);
  });

  // Parse config_json string back to object
  const data = templates.map((t) => ({
    ...t,
    config_json: t.config_json ? JSON.parse(t.config_json) : null,
  }));
  cache.set(cacheKey, data);
  return data;
};

/**
 * Menyimpan template baru
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.paper_size
 * @param {Object|string} data.config_json
 * @returns {Promise<number>}
 */
export const createTemplate = async (data) => {
  if (!data.name) throw new Error("Nama template wajib diisi");

  const payload = {
    name: data.name,
    paper_size: data.paper_size || "80x40",
    config_json:
      typeof data.config_json === "string" ? data.config_json : JSON.stringify(data.config_json),
  };

  const newId = await withTransaction(async (connection) => {
    return await repo.createTemplate(connection, payload);
  });

  cache.del("MASTER_STICKER_TEMPLATES");
  emitSharedTaskSignal("MASTER_DATA", "REFRESH_STICKER_TEMPLATES").catch((e) =>
    Logger.error("Signal Error", e, "STICKER_TEMPLATE_SERVICE")
  );

  return newId;
};

/**
 * Menghapus template
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const removeTemplate = async (id) => {
  if (!id || isNaN(id)) throw new Error("ID tidak valid");

  const success = await withTransaction(async (connection) => {
    return await repo.deleteTemplate(connection, id);
  });

  cache.del("MASTER_STICKER_TEMPLATES");
  emitSharedTaskSignal("MASTER_DATA", "REFRESH_STICKER_TEMPLATES").catch((e) =>
    Logger.error("Signal Error", e, "STICKER_TEMPLATE_SERVICE")
  );

  return success;
};

/**
 * Memperbarui template yang sudah ada
 * @param {number} id
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.paper_size
 * @param {Object|string} data.config_json
 * @returns {Promise<boolean>}
 */
export const editTemplate = async (id, data) => {
  if (!id || isNaN(id)) throw new Error("ID tidak valid");
  if (!data.name) throw new Error("Nama template wajib diisi");

  const payload = {
    name: data.name,
    paper_size: data.paper_size || "80x40",
    config_json:
      typeof data.config_json === "string" ? data.config_json : JSON.stringify(data.config_json),
  };

  const success = await withTransaction(async (connection) => {
    return await repo.updateTemplate(connection, id, payload);
  });

  cache.del("MASTER_STICKER_TEMPLATES");
  emitSharedTaskSignal("MASTER_DATA", "REFRESH_STICKER_TEMPLATES").catch((e) =>
    Logger.error("Signal Error", e, "STICKER_TEMPLATE_SERVICE")
  );

  return success;
};
