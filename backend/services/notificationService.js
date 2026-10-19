import Logger from "../utils/logger.js";
import * as notificationRepo from "../repositories/notificationRepository.js";
import { signals } from "./firebaseSignalService.js";
import { withTransaction, withConnection } from "../utils/dbUtils.js";

/**
 * @param {number} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export const fetchRecentPending = async (userId, limit = 5) => {
  return withConnection(async (connection) => {
    const notifications = await notificationRepo.getRecentPending(connection, userId, limit);
    return notifications.map((n) => ({
      ...n,
      action_payload: n.action_payload ? JSON.parse(n.action_payload) : null,
    }));
  });
};

/**
 * @param {number} userId
 * @param {string} filterType
 * @returns {Promise<Array>}
 */
export const fetchAll = async (userId, filterType = "ALL") => {
  return withConnection(async (connection) => {
    const notifications = await notificationRepo.getAll(connection, userId, filterType);
    return notifications.map((n) => ({
      ...n,
      action_payload: n.action_payload ? JSON.parse(n.action_payload) : null,
    }));
  });
};

/**
 * @param {number} notificationId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
export const markNotificationAsDone = async (notificationId, userId) => {
  const affected = await withTransaction(async (connection) => {
    return notificationRepo.markAsDone(connection, notificationId, userId);
  });

  if (affected > 0) {
    signals.userNotifications(userId);
  }

  return affected > 0;
};

/**
 * @param {number} notificationId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
export const claimNotification = async (notificationId, userId) => {
  const affected = await withTransaction(async (connection) => {
    return notificationRepo.claimTask(connection, notificationId, userId);
  });

  if (affected > 0) {
    signals.userNotifications(userId);
  }

  return affected > 0;
};

/**
 * @param {number} userId
 * @returns {Promise<number>}
 */
export const markAllNotificationsAsDone = async (userId) => {
  const affected = await withTransaction(async (connection) => {
    return notificationRepo.markAllAsDone(connection, userId);
  });

  if (affected > 0) {
    signals.userNotifications(userId);
  }

  return affected;
};

/**
 * @param {number} userId
 * @returns {Promise<Array>}
 */
export const fetchPreferences = async (userId) => {
  return withConnection(async (connection) => {
    const prefs = await notificationRepo.getPreferences(connection, userId);

    const defaultTypes = ["WMS", "HRIS", "SYSTEM"];
    return defaultTypes.map((type) => {
      const found = prefs.find((p) => p.type === type);
      return {
        type,
        is_enabled: found ? !!found.is_enabled : true,
      };
    });
  });
};

/**
 * @param {number} userId
 * @param {Array<{type: string, is_enabled: boolean}>} preferences
 * @returns {Promise<boolean>}
 */
export const updatePreferences = async (userId, preferences) => {
  return withTransaction(async (connection) => {
    for (const pref of preferences) {
      await notificationRepo.upsertPreference(connection, userId, pref.type, pref.is_enabled);
    }
    return true;
  });
};

/**
 * @param {number[]} userIds
 * @param {string} type
 * @param {string} title
 * @param {string} message
 * @param {Object|null} actionPayload
 * @param {boolean} isDone - true untuk informatif, false untuk actionable
 * @returns {Promise<void>}
 */
export const notifyUsers = async (
  userIds,
  type,
  title,
  message,
  actionPayload = null,
  isDone = false,
) => {
  if (!userIds || userIds.length === 0) return;

  try {
    await withConnection(async (connection) => {
      for (const userId of userIds) {
        const prefs = await notificationRepo.getPreferences(connection, userId);
        const pref = prefs.find((p) => p.type === type);
        const isEnabled = pref ? !!pref.is_enabled : true;

        if (isEnabled) {
          await notificationRepo.createNotification(connection, {
            userId,
            type,
            title,
            message,
            actionPayload,
            isDone,
          });

          signals.userNotifications(userId);
        }
      }
    });
  } catch (error) {
    Logger.error("Gagal mengirim notifikasi:", error, "NOTIFICATION_SERVICE");
  }
};

/**
 * Membuat notifikasi untuk semua user yang memiliki permission tertentu.
 * Menggunakan model "Shared Task" — hanya 1 row INSERT, tanpa loop per user.
 *
 * @param {string} permissionName - Nama permission yang jadi target
 * @param {string} type - Tipe notifikasi (WMS, HRIS, SYSTEM)
 * @param {string} title
 * @param {string} message
 * @param {Object|null} actionPayload
 * @param {number|null} excludeUserId - User yang tidak perlu melihat task ini
 * @param {boolean} isDone - true untuk informatif, false untuk actionable
 * @returns {Promise<void>}
 */
export const notifyUsersByPermission = async (
  permissionName,
  type,
  title,
  message,
  actionPayload = null,
  excludeUserId = null,
  isDone = false,
) => {
  try {
    await withConnection(async (connection) => {
      await notificationRepo.createNotification(connection, {
        userId: null,
        type,
        title,
        message,
        actionPayload,
        isDone,
        targetPermission: permissionName,
        excludeUserId,
      });

      signals.sharedTaskNotifications(permissionName);
    });
  } catch (error) {
    Logger.error("Gagal membuat shared task notification:", error, "NOTIFICATION_SERVICE");
  }
};

// Backward-compatibility aliases
export const fetchRecentUnread = fetchRecentPending;
export const markNotificationAsRead = markNotificationAsDone;
export const markAllNotificationsAsRead = markAllNotificationsAsDone;
