/**
 * Utilitas Paginasi Server-Side
 * Mengonsolidasikan normalisasi parameter limit/offset/page dan standardisasi metadata respons.
 */

/**
 * Menghitung SQL offset dari page dan limit.
 *
 * @param {number|string} [page=1] - Nomor halaman (1-indexed)
 * @param {number|string} [limit=10] - Jumlah item per halaman
 * @returns {number} Offset SQL yang valid (>= 0)
 */
export const getPaginationOffset = (page = 1, limit = 10) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = parseInt(limit, 10);
  const safeLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : parsedLimit;
  return (safePage - 1) * safeLimit;
};

/**
 * Menormalisasi parameter paginasi (page, limit, offset).
 * Mendukung objek params/query (e.g., req.query) maupun parameter numerik langsung.
 *
 * @param {object|number|string} [params={}] - Objek query/params atau angka page
 * @param {number} [defaultLimit=10] - Default limit jika tidak disertakan atau <= 0
 * @param {number} [maxLimit=100] - Batas limit maksimum yang diizinkan
 * @returns {{ page: number, limit: number, offset: number }}
 */
export const normalizePagination = (params = {}, defaultLimit = 10, maxLimit = 100) => {
  let rawPage;
  let rawLimit;

  if (typeof params === "object" && params !== null) {
    rawPage = params.page;
    rawLimit = params.limit;
  } else {
    rawPage = params;
    rawLimit = defaultLimit;
  }

  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const parsedLimit = parseInt(rawLimit, 10);
  const baseLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? defaultLimit : parsedLimit;
  const effectiveMax = Math.max(defaultLimit, maxLimit);
  const limit = Math.min(baseLimit, effectiveMax);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Memformat metadata paginasi standar untuk respons API.
 *
 * @param {number|string} [total=0] - Total seluruh record yang cocok
 * @param {number|string} [page=1] - Nomor halaman aktif
 * @param {number|string} [limit=10] - Jumlah item per halaman
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
export const formatPaginationMeta = (total = 0, page = 1, limit = 10) => {
  const safeTotal = Math.max(0, parseInt(total, 10) || 0);
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = parseInt(limit, 10);
  const safeLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 10 : parsedLimit;
  const totalPages = Math.ceil(safeTotal / safeLimit);

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
  };
};
