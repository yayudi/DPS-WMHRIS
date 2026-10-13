// backend/services/authService.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../config/db.js";
import AppError from "../utils/AppError.js";
import * as userRepo from "../repositories/userRepository.js";
import { createLog } from "../repositories/systemLogRepository.js";
import Logger from "../utils/logger.js";

/**
 * Service untuk menangani logika autentikasi login.
 * @param {string} username
 * @param {string} password
 * @param {string} ip
 * @param {string} userAgent
 * @returns {Promise<{token: string, user: Object}>}
 */
export const loginService = async (username, password, ip, userAgent) => {
  const user = await userRepo.getUserByUsername(db, username);

  if (!user) {
    throw new AppError("User tidak ditemukan", 401, "AUTH_FAILED");
  }

  if (!user.password_hash) {
    Logger.error(`User '${username}' tidak memiliki hash password di database`, null, "AUTH_SERVICE");
    throw new AppError("Konfigurasi akun error. Hubungi administrator.", 500, "CONFIG_ERROR");
  }

  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) {
    throw new AppError("Password salah", 401, "AUTH_FAILED");
  }

  const { role, permissions } = await userRepo.getRoleAndPermissions(db, user.role_id);

  const payload = {
    id: user.id,
    username: user.username,
    nickname: user.nickname || null,
    role: role,
    role_id: user.role_id,
    permissions: permissions,
  };

  // LOGGING
  await createLog(db, {
    userId: user.id,
    action: "LOGIN",
    targetType: "USER",
    targetId: String(user.id),
    changes: { note: "User logged in via Web" },
    ip: ip,
    userAgent: userAgent || "Unknown",
  });

  // JWT_SECRET dari .env
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });

  return { token, user: payload };
};
