// backend/services/roleService.js
import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import * as roleRepo from "../repositories/roleRepository.js";
import { createLog } from "../repositories/systemLogRepository.js";
import { signals } from "./firebaseSignalService.js";
import cache from "../config/cache.js";
import { withTransaction } from "../utils/dbUtils.js";

/**
 * @returns {Promise<any>}
 */
export const getRolesService = async () => {
  const cacheKey = "MASTER_ROLES";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const data = await roleRepo.getRoles(db);
  cache.set(cacheKey, data);
  return data;
};

/**
 * @returns {Promise<any>}
 */
export const getPermissionsService = async () => {
  const cacheKey = "MASTER_PERMISSIONS";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const data = await roleRepo.getPermissions(db);
  cache.set(cacheKey, data);
  return data;
};

/**
 * @param {number|string} roleId
 * @returns {Promise<any>}
 */
export const getRolePermissionsService = async (roleId) => {
  return await roleRepo.getRolePermissions(db, roleId);
};

/**
 * @param {number|string} roleId
 * @param {number|string} permissionIds
 * @param {number|string} userId
 * @param {any} ip
 * @param {any} userAgent
 * @returns {Promise<any>}
 */
export const updateRolePermissionsService = async (roleId, permissionIds, userId, ip, userAgent) => {
  try {
    await withTransaction(async (connection) => {
      await roleRepo.deleteRolePermissions(connection, roleId);
      await roleRepo.insertRolePermissions(connection, roleId, permissionIds);

      await createLog(connection, {
        userId: userId,
        action: "UPDATE",
        targetType: "ROLE",
        targetId: String(roleId),
        changes: { note: "Updated Role Permissions", permissionCount: permissionIds.length },
        ip,
        userAgent,
      });
    });

    cache.del("MASTER_ROLES");
    signals.refreshRoles();
  } catch (error) {
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      throw new AppError("Satu atau lebih ID izin atau peran tidak valid.", 400);
    }
    throw error;
  }
};

/**
 * @param {any} name
 * @param {any} description
 * @param {number|string} userId
 * @param {any} ip
 * @param {any} userAgent
 * @returns {Promise<any>}
 */
export const createRoleService = async (name, description, userId, ip, userAgent) => {
  try {
    const roleId = await roleRepo.createRole(db, name, description);

    await createLog(db, {
      userId,
      action: "CREATE",
      targetType: "ROLE",
      targetId: String(roleId),
      changes: { name, description },
      ip,
      userAgent,
    });

    cache.del("MASTER_ROLES");
    signals.refreshRoles();
    return roleId;
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError("Nama peran sudah ada.", 409);
    }
    throw error;
  }
};

/**
 * @param {number|string} roleId
 * @param {any} name
 * @param {any} description
 * @param {number|string} userId
 * @param {any} ip
 * @param {any} userAgent
 * @returns {Promise<any>}
 */
export const updateRoleService = async (roleId, name, description, userId, ip, userAgent) => {
  try {
    const isUpdated = await roleRepo.updateRole(db, roleId, name, description);
    if (!isUpdated) throw new AppError("Peran tidak ditemukan.", 404);

    await createLog(db, {
      userId,
      action: "UPDATE",
      targetType: "ROLE",
      targetId: String(roleId),
      changes: { name, description },
      ip,
      userAgent,
    });
    
    cache.del("MASTER_ROLES");
    signals.refreshRoles();
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError("Nama peran sudah digunakan.", 409);
    }
    throw error;
  }
};

/**
 * @param {number|string} roleId
 * @param {number|string} userId
 * @param {any} ip
 * @param {any} userAgent
 * @returns {Promise<any>}
 */
export const deleteRoleService = async (roleId, userId, ip, userAgent) => {
  try {
    const isDeleted = await roleRepo.deleteRole(db, roleId);
    if (!isDeleted) throw new AppError("Peran tidak ditemukan.", 404);

    await createLog(db, {
      userId,
      action: "DELETE",
      targetType: "ROLE",
      targetId: String(roleId),
      changes: { note: "Deleted Role" },
      ip,
      userAgent,
    });
    
    cache.del("MASTER_ROLES");
    signals.refreshRoles();
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      throw new AppError("Gagal menghapus: Peran ini masih digunakan oleh satu atau lebih pengguna.", 400);
    }
    throw error;
  }
};
