// backend/repositories/mediaRepository.js

/**
 * Helper: Membangun klausa WHERE berdasarkan filters
 * @param {{ search?: string, linkStatus?: string }} filters
 * @returns {{ clause: string, params: Array }}
 */
const buildFilterClause = (filters = {}) => {
  const conditions = [];
  const params = [];

  // Global Search: nama file, tags (LIKE), atau produk tertaut (nama/sku)
  if (filters.search) {
    const keyword = `%${filters.search}%`;
    conditions.push(`(
      m.title LIKE ?
      OR m.tags LIKE ?
      OR EXISTS (
        SELECT 1 FROM product_images pi
        JOIN products prod ON pi.product_id = prod.id
        WHERE pi.media_id = m.id AND (prod.name LIKE ? OR prod.sku LIKE ?)
      )
    )`);
    params.push(keyword, keyword, keyword, keyword);
  }

  // Link Status Filter
  if (filters.linkStatus) {
    if (typeof filters.linkStatus === 'object') {
      const inc = filters.linkStatus.include || [];
      const exc = filters.linkStatus.exclude || [];
      if (inc.length > 0) {
        if (inc.includes('linked') && !inc.includes('orphaned')) {
          conditions.push(`EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`);
        } else if (inc.includes('orphaned') && !inc.includes('linked')) {
          conditions.push(`NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`);
        }
      } else if (exc.length > 0) {
        if (exc.includes('linked') && !exc.includes('orphaned')) {
          conditions.push(`NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`);
        } else if (exc.includes('orphaned') && !exc.includes('linked')) {
          conditions.push(`EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`);
        }
      }
    } else {
      if (filters.linkStatus === 'linked') {
        conditions.push(`EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`);
      } else if (filters.linkStatus === 'orphaned') {
        conditions.push(`NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.media_id = m.id)`);
      }
    }
  }

  const clause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  return { clause, params };
};

/**
 * Mendapatkan daftar aset media dengan paginasi dan filter
 * @param {object} connection
 * @param {number} limit
 * @param {number} offset
 * @param {{ search?: string, linkStatus?: string }} filters
 * @returns {Promise<Array>}
 */
export const getMediaAssets = async (connection, limit = 50, offset = 0, filters = {}) => {
  const { clause, params } = buildFilterClause(filters);

  const query = `
    SELECT m.*,
      (SELECT COUNT(p.id) FROM product_images p WHERE p.media_id = m.id) AS usage_count,
      (SELECT GROUP_CONCAT(prod.name SEPARATOR '||') FROM product_images p JOIN products prod ON p.product_id = prod.id WHERE p.media_id = m.id) AS linked_products
    FROM media_assets m
    ${clause}
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const [rows] = await connection.query(query, params);
  return rows;
};

/**
 * Mendapatkan total aset media untuk pagination
 * @param {object} connection
 * @param {{ search?: string, linkStatus?: string }} filters
 * @returns {Promise<number>}
 */
export const getTotalMediaAssets = async (connection, filters = {}) => {
  const { clause, params } = buildFilterClause(filters);

  const query = `SELECT COUNT(id) as total FROM media_assets m ${clause}`;

  const [rows] = await connection.query(query, params);
  return rows[0].total;
};

/**
 * Mengambil detail media beserta produk yang terkait (Reverse Linking)
 * @param {object} connection
 * @param {number} mediaId
 * @returns {Promise<object>}
 */
export const getMediaDetailsWithProducts = async (connection, mediaId) => {
  const [mediaRows] = await connection.query(`SELECT * FROM media_assets WHERE id = ?`, [mediaId]);
  if (mediaRows.length === 0) return null;
  const media = mediaRows[0];

  const [productRows] = await connection.query(`
    SELECT p.id, p.sku, p.name, p.is_active, pi.id as pivot_id, pi.is_primary
    FROM product_images pi
    JOIN products p ON pi.product_id = p.id
    WHERE pi.media_id = ?
    ORDER BY pi.id DESC
  `, [mediaId]);

  media.products = productRows;
  return media;
};

/**
 * Menyimpan data media yang baru diupload
 * @param {object} connection
 * @param {object} mediaData
 * @returns {Promise<number>}
 */
export const createMediaAsset = async (connection, mediaData) => {
  const { 
    title, mainPath, thumbnailPath, status, uploaderId, tags, hash, duplicateOf,
    sizeBytes, width, height 
  } = mediaData;
  const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null;

  const [result] = await connection.query(`
    INSERT INTO media_assets (
      title, main_path, thumbnail_path, status, uploader_id, tags, hash, duplicate_of,
      size_bytes, width, height
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    title, mainPath, thumbnailPath, status, uploaderId, tagsJson, hash, duplicateOf,
    sizeBytes, width, height
  ]);

  return result.insertId;
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {boolean} hash
 * @returns {Promise<any>}
 */
export const getMediaAssetByHash = async (connection, hash) => {
  const [rows] = await connection.query('SELECT id FROM media_assets WHERE hash = ?', [hash]);
  return rows[0] || null;
};

/**
 * Menambahkan file ke antrean hapus R2
 * @param {object} connection
 * @param {string} r2Key
 * @returns {Promise<void>}
 */
export const insertTrashQueue = async (connection, r2Key) => {
  if (!r2Key) return;
  await connection.query('INSERT INTO r2_trash_queue (r2_key) VALUES (?)', [r2Key]);
};

/**
 * Menghapus Media Asset dari DB
 * @param {object} connection
 * @param {number} mediaId
 * @returns {Promise<void>}
 */
export const deleteMediaAsset = async (connection, mediaId) => {
  await connection.query('DELETE FROM media_assets WHERE id = ?', [mediaId]);
};

/**
 * @param {import('mysql2/promise').Connection} connection
 * @param {number|string} mediaId
 * @returns {Promise<any>}
 */
export const getMediaAssetById = async (connection, mediaId) => {
  const [rows] = await connection.query('SELECT * FROM media_assets WHERE id = ?', [mediaId]);
  return rows[0] || null;
};

/**
 * Mendapatkan beberapa Media Asset by IDs
 * @param {object} connection
 * @param {Array<number>} mediaIds
 * @returns {Promise<Array<object>>}
 */
export const getMediaAssetsByIds = async (connection, mediaIds) => {
  if (!mediaIds || mediaIds.length === 0) return [];
  const [rows] = await connection.query('SELECT id, status, main_path, thumbnail_path FROM media_assets WHERE id IN (?)', [mediaIds]);
  return rows;
};

/**
 * Update Tags dari Media Asset
 * @param {object} connection
 * @param {number} mediaId
 * @param {Array} tags
 * @returns {Promise<void>}
 */
export const updateMediaTags = async (connection, mediaId, tags) => {
  const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags.map(t => t.toLowerCase())) : null;
  await connection.query('UPDATE media_assets SET tags = ? WHERE id = ?', [tagsJson, mediaId]);
};

/**
 * Update Title dari Media Asset
 * @param {object} connection
 * @param {number} mediaId
 * @param {string} title
 * @returns {Promise<void>}
 */
export const updateMediaTitle = async (connection, mediaId, title) => {
  await connection.query('UPDATE media_assets SET title = ? WHERE id = ?', [title, mediaId]);
};

/**
 * Mencari aset media berdasarkan pola path
 * @param {import('mysql2/promise').Connection} connection
 * @param {string} searchPath
 * @returns {Promise<Array<{ id: number }>>}
 */
export const findMediaByPath = async (connection, searchPath) => {
  const [rows] = await connection.query(
    "SELECT id FROM media_assets WHERE main_path LIKE ? OR thumbnail_path LIKE ?",
    [`%${searchPath}`, `%${searchPath}`]
  );
  return rows;
};

