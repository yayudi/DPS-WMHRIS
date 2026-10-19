/**
 * backend/utils/jsonUtils.js
 * Utility untuk deserialisasi JSON yang aman dan kompatibel dengan MariaDB 10.11 native metadata
 * serta fallback parsing string legacy.
 */

/**
 * Mengurai nilai JSON dari database (MariaDB 10.11 Object/String) atau request payload dengan aman.
 * 
 * @template T
 * @param {any} raw - Input yang akan di-parse (dapat berupa string JSON, Object, null, undefined, dll)
 * @param {T} [fallback={}] - Nilai fallback jika parsing gagal atau input null/undefined
 * @returns {T|any} - Objek hasil parse atau fallback
 */
export const parseJsonSafe = (raw, fallback = {}) => {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  // Jika driver MariaDB 10.11 sudah mendeserialisasi otomatis menjadi Object/Array
  if (typeof raw === "object") {
    return raw;
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  return fallback;
};
