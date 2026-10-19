/**
 * backend/utils/dbUtils.js
 * Utility manajemen lifecycle koneksi dan transaksi database MariaDB/MySQL.
 */
import db from "../config/db.js";

/**
 * Menjalankan operasi dalam blok transaksi DB dengan garansi commit/rollback/release otomatis.
 * Mendukung nested transaction safety melalui parameter existingConnection.
 *
 * @template T
 * @param {(connection: import('mysql2/promise').Connection) => Promise<T>} callback - Fungsi async yang menerima objek connection
 * @param {import('mysql2/promise').Connection} [existingConnection=null] - Koneksi aktif yang sudah berada dalam transaksi di layer atas
 * @returns {Promise<T>} Hasil dari eksekusi callback
 */
export const withTransaction = async (callback, existingConnection = null) => {
  if (existingConnection) {
    return await callback(existingConnection);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Menjalankan operasi database read-only/single-query dengan jaminan connection release otomatis.
 *
 * @template T
 * @param {(connection: import('mysql2/promise').Connection) => Promise<T>} callback - Fungsi async yang menerima objek connection
 * @param {import('mysql2/promise').Connection} [existingConnection=null] - Koneksi aktif yang sudah terbuka sebelumnya
 * @returns {Promise<T>} Hasil dari eksekusi callback
 */
export const withConnection = async (callback, existingConnection = null) => {
  if (existingConnection) {
    return await callback(existingConnection);
  }

  const connection = await db.getConnection();
  try {
    return await callback(connection);
  } finally {
    connection.release();
  }
};
