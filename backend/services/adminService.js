// backend/services/adminService.js
import Logger from "../utils/logger.js";
import bcrypt from "bcryptjs";
import * as adminRepo from "../repositories/adminRepository.js";
import { createLog } from "../repositories/systemLogRepository.js";
import { emitSharedTaskSignal } from "./firebaseSignalService.js";
import cache from "../config/cache.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";

/**
 * Mengambil semua user aktif.
 * @returns {Promise<Array>}
 */
export const getAllUsers = async () => {
  const cacheKey = "MASTER_USERS_ACTIVE";
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  return withConnection(async (connection) => {
    const data = await adminRepo.findAllActiveUsers(connection);
    cache.set(cacheKey, data);
    return data;
  });
};

/**
 * Mengambil semua role.
 * @returns {Promise<Array>}
 */
export const getAllRoles = async () => {
  return withConnection(async (connection) => {
    return adminRepo.findAllRoles(connection);
  });
};

/**
 * Membuat user baru dengan transaksi + audit log.
 * @param {object} params
 * @param {number} params.adminId - ID admin yang melakukan aksi
 * @param {string} params.username
 * @param {string} params.password
 * @param {number} params.roleId
 * @param {string|null} params.nickname
 * @param {number|null} params.shiftId
 * @param {boolean} params.excludeFromAttendance
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @returns {Promise<object>} newUser
 */
export const createUser = async ({
  adminId,
  username,
  password,
  roleId,
  nickname,
  shiftId,
  excludeFromAttendance,
  ip,
  userAgent,
}) => {
  return withTransaction(async (connection) => {
    const passwordHash = await bcrypt.hash(password, 10);

    const insertId = await adminRepo.insertUser(connection, {
      username,
      passwordHash,
      roleId,
      nickname: nickname || null,
      shiftId: shiftId || null,
      excludeFromAttendance: excludeFromAttendance ? 1 : 0,
    });

    const newUser = {
      id: insertId,
      username,
      nickname: nickname || null,
      role_id: roleId,
      shift_id: shiftId || null,
      exclude_from_attendance: excludeFromAttendance ? 1 : 0,
    };

    // Audit Log
    await createLog(connection, {
      userId: adminId,
      action: "CREATE",
      targetType: "USER",
      targetId: String(insertId),
      changes: newUser,
      ip,
      userAgent,
    });

    cache.del("MASTER_USERS_ACTIVE");
    emitSharedTaskSignal("MASTER_DATA", "REFRESH_USERS").catch((e) =>
      Logger.error("Signal Error", e, "ADMIN_SERVICE"),
    );
    return newUser;
  });
};

/**
 * Update user berdasarkan ID dengan transaksi + audit log.
 * @param {object} params
 * @param {number} params.adminId
 * @param {number} params.targetId
 * @param {object} params.data - { username, nickname, newPassword, role_id, shift_id, exclude_from_attendance }
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @returns {Promise<void>}
 */
export const updateUser = async ({ adminId, targetId, data, ip, userAgent }) => {
  const { username, nickname, newPassword, role_id, shift_id, exclude_from_attendance } = data;

  return withTransaction(async (connection) => {
    const oldUser = await adminRepo.findUserById(connection, targetId);
    if (!oldUser) {
      const err = new Error("User tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }

    const updateFields = [];
    const updateValues = [];
    const changesRecord = {};

    if (username !== undefined && oldUser.username !== username) {
      updateFields.push("username = ?");
      updateValues.push(username);
      changesRecord.username = { old: oldUser.username, new: username };
    }

    if (nickname !== undefined) {
      const newNickname = nickname === "" ? null : nickname;
      if (oldUser.nickname !== newNickname) {
        updateFields.push("nickname = ?");
        updateValues.push(newNickname);
        changesRecord.nickname = { old: oldUser.nickname, new: newNickname };
      }
    }

    if (role_id !== undefined && oldUser.role_id !== role_id) {
      updateFields.push("role_id = ?");
      updateValues.push(role_id);
      changesRecord.role_id = { old: oldUser.role_id, new: role_id };
    }

    if (shift_id !== undefined) {
      const newShiftId = shift_id === "" ? null : shift_id;
      if (oldUser.shift_id !== newShiftId) {
        updateFields.push("shift_id = ?");
        updateValues.push(newShiftId);
        changesRecord.shift_id = { old: oldUser.shift_id, new: newShiftId };
      }
    }

    if (exclude_from_attendance !== undefined) {
      const newExclude = exclude_from_attendance ? 1 : 0;
      if (oldUser.exclude_from_attendance !== newExclude) {
        updateFields.push("exclude_from_attendance = ?");
        updateValues.push(newExclude);
        changesRecord.exclude_from_attendance = { old: oldUser.exclude_from_attendance, new: newExclude };
      }
    }

    if (newPassword) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateFields.push("password_hash = ?");
      updateValues.push(hashedPassword);
      changesRecord.password = { old: "***", new: "*** (changed)" };
    }

    if (updateFields.length > 0) {
      await adminRepo.updateUserById(connection, targetId, updateFields, updateValues);
    }

    // Audit Log (Hanya jika ada perubahan)
    if (Object.keys(changesRecord).length > 0) {
      await createLog(connection, {
        userId: adminId,
        action: "UPDATE",
        targetType: "USER",
        targetId: String(targetId),
        changes: { note: "Updated User Profile", ...changesRecord },
        ip,
        userAgent,
      });
    }

    cache.del("MASTER_USERS_ACTIVE");
    emitSharedTaskSignal("MASTER_DATA", "REFRESH_USERS").catch((e) =>
      Logger.error("Signal Error", e, "ADMIN_SERVICE"),
    );

    // Jika terjadi perubahan role atau password, paksa user logout via Firebase
    if (changesRecord.role_id || changesRecord.password) {
      emitSharedTaskSignal("AUTH_SECURITY", `FORCE_LOGOUT_${targetId}`).catch((e) =>
        Logger.error("Signal Error", e, "ADMIN_SERVICE"),
      );
    }
  });
};

/**
 * Soft delete user + audit log.
 * @param {object} params
 * @param {number} params.adminId
 * @param {number} params.targetId
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @returns {Promise<void>}
 */
export const deleteUser = async ({ adminId, targetId, ip, userAgent }) => {
  // Bisnis rule: admin tidak bisa menghapus dirinya sendiri
  if (adminId === targetId) {
    const err = new Error("Anda tidak bisa menghapus akun Anda sendiri.");
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (connection) => {
    await adminRepo.softDeleteUser(connection, targetId);

    // Audit Log
    await createLog(connection, {
      userId: adminId,
      action: "DELETE",
      targetType: "USER",
      targetId: String(targetId),
      changes: { note: "Soft Deleted User" },
      ip,
      userAgent,
    });

    cache.del("MASTER_USERS_ACTIVE");
    emitSharedTaskSignal("MASTER_DATA", "REFRESH_USERS").catch((e) =>
      Logger.error("Signal Error", e, "ADMIN_SERVICE"),
    );
    emitSharedTaskSignal("AUTH_SECURITY", `FORCE_LOGOUT_${targetId}`).catch((e) =>
      Logger.error("Signal Error", e, "ADMIN_SERVICE"),
    );
  });
};

/**
 * Mengambil lokasi yang diizinkan untuk user tertentu.
 * @param {number} userId
 * @returns {Promise<number[]>}
 */
export const getUserLocations = async (userId) => {
  return withConnection(async (connection) => {
    return adminRepo.findUserLocationIds(connection, userId);
  });
};

/**
 * Update lokasi user dengan transaksi + audit log.
 * @param {object} params
 * @param {number} params.adminId
 * @param {number} params.targetId
 * @param {number[]} params.locationIds
 * @param {string} params.ip
 * @param {string} params.userAgent
 * @returns {Promise<void>}
 */
export const updateUserLocations = async ({ adminId, targetId, locationIds, ip, userAgent }) => {
  return withTransaction(async (connection) => {
    await adminRepo.replaceUserLocations(connection, targetId, locationIds);

    // Audit Log
    await createLog(connection, {
      userId: adminId,
      action: "UPDATE",
      targetType: "USER",
      targetId: String(targetId),
      changes: { note: "Updated User Locations", locationIds: locationIds.join(", ") },
      ip,
      userAgent,
    });
  });
};
