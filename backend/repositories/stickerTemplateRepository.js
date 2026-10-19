/**
 * @typedef {Object} StickerTemplate
 * @property {number} id
 * @property {string} name
 * @property {string} paper_size
 * @property {string} config_json
 * @property {number} is_active
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Dapatkan semua template yang aktif
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<StickerTemplate[]>}
 */
export const getAllTemplates = async (connection) => {
  const [rows] = await connection.query(
    `SELECT id, name, paper_size, config_json, is_active, created_at, updated_at 
     FROM sticker_templates 
     WHERE is_active = 1 
     ORDER BY name ASC`
  );
  return rows;
};

/**
 * Simpan template baru
 * @param {import('mysql2/promise').Connection} connection
 * @param {Object} templateData
 * @param {string} templateData.name
 * @param {string} templateData.paper_size
 * @param {string} templateData.config_json
 * @returns {Promise<number>} ID template yang baru dibuat
 */
export const createTemplate = async (connection, templateData) => {
  const [result] = await connection.query(
    `INSERT INTO sticker_templates (name, paper_size, config_json) 
     VALUES (?, ?, ?)`,
    [templateData.name, templateData.paper_size, templateData.config_json]
  );
  return result.insertId;
};

/**
 * Hapus (soft delete atau hard delete) template berdasarkan ID
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} id 
 * @returns {Promise<boolean>}
 */
export const deleteTemplate = async (connection, id) => {
  const [result] = await connection.query(
    `DELETE FROM sticker_templates WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

/**
 * Update template berdasarkan ID
 * @param {import('mysql2/promise').Connection} connection
 * @param {number} id
 * @param {Object} templateData
 * @param {string} templateData.name
 * @param {string} templateData.paper_size
 * @param {string} templateData.config_json
 * @returns {Promise<boolean>} 
 */
export const updateTemplate = async (connection, id, templateData) => {
  const [result] = await connection.query(
    `UPDATE sticker_templates 
     SET name = ?, paper_size = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [templateData.name, templateData.paper_size, templateData.config_json, id]
  );
  return result.affectedRows > 0;
};
