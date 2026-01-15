import db from "../config/db.js";
import * as locationRepository from "../repositories/locationRepository.js";

/**
 * Menambahkan lokasi baru
 * @param {object} data - { code, building, floor, name, purpose }
 * @returns {Promise<number>} ID lokasi baru
 * @throws {Error} Jika validasi gagal
 */
export const addLocation = async (data) => {
  const { code, building, purpose } = data;

  // 1. Business Validation
  if (!code || !building || !purpose) {
    throw new Error("VALIDATION_ERROR: Code, Building, and Purpose are required.");
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 2. Check Duplicate
    const existingId = await locationRepository.getIdByCode(connection, code);
    if (existingId) {
      throw new Error("VALIDATION_ERROR: Location code already exists.");
    }

    // 3. Insert Data
    const newLocationId = await locationRepository.createLocation(connection, data);

    // 4. Audit Log (Placeholder - Implementasikan sesuai kebutuhan sistem audit)
    // await auditRepository.logAction(connection, 'CREATE', 'locations', newLocationId, data);

    await connection.commit();
    return newLocationId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
