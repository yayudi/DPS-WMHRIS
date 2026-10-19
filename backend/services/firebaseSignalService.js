import { isInitialized, firebaseDb } from '../config/firebase.js';
import Logger from '../utils/logger.js';

/**
 * Mengirim sinyal (ping) ke Firebase Realtime Database
 * @param {string} path - Path di Firebase (misal: signals/users/1 atau signals/permissions/MANAGE_USERS)
 * @param {Object} payload - Data tambahan yang dikirim (misal { action: 'REFRESH_NOTIFICATIONS' })
 * @returns {Promise<boolean>}
 */
const emitSignal = async (path, payload = {}) => {
  if (!isInitialized || !firebaseDb) {
    Logger.warn(`Tidak dapat mengirim sinyal karena Firebase belum terinisialisasi. Path: ${path}`, "FIREBASE_SIGNAL");
    return false;
  }

  try {
    const dataToSet = {
      ...payload,
      last_updated: Date.now()
    };
    
    await firebaseDb.ref(path).set(dataToSet);
    return true;
  } catch (error) {
    Logger.error(`Gagal mengirim sinyal ke ${path}:`, error, "FIREBASE_SIGNAL");
    return false;
  }
};

/**
 * @param {number|string} userId
 * @param {string} action
 */
export const emitUserSignal = async (userId, action = 'REFRESH_NOTIFICATIONS') => {
  const safeUserId = String(userId).replace(/[.#$[\]]/g, '_');
  return await emitSignal(`signals/users/${safeUserId}`, { action });
};

/**
 * @param {string} permission
 * @param {string} action
 */
export const emitSharedTaskSignal = async (permission, action = 'REFRESH_NOTIFICATIONS') => {
  const safePermission = permission.replace(/[.#$[\]]/g, '_');
  return await emitSignal(`signals/permissions/${safePermission}`, { action });
};

/**
 * Pembungkus internal agar pemanggilan sinyal tidak pernah throw atau menyebabkan unhandled rejection.
 * @param {() => Promise<boolean>} emitFn
 * @param {string} signalName
 * @returns {Promise<boolean>}
 */
const safeSignal = async (emitFn, signalName) => {
  try {
    return await emitFn();
  } catch (error) {
    Logger.error(`Signal Error [${signalName}]`, error, "FIREBASE_SIGNAL");
    return false;
  }
};

/**
 * Facade terpusat untuk emit sinyal dengan penanganan error bawaan dan eliminasi magic string.
 */
export const signals = {
  refreshStock: () => safeSignal(() => emitSharedTaskSignal('WMS_DASHBOARD', 'REFRESH_STOCK'), 'REFRESH_STOCK'),
  refreshPicking: () => safeSignal(() => emitSharedTaskSignal('PICKING_LIST', 'REFRESH_PICKING'), 'REFRESH_PICKING'),
  refreshProducts: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_PRODUCTS'), 'REFRESH_PRODUCTS'),
  refreshCategories: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_CATEGORIES'), 'REFRESH_CATEGORIES'),
  refreshLocations: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_LOCATIONS'), 'REFRESH_LOCATIONS'),
  refreshRoles: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_ROLES'), 'REFRESH_ROLES'),
  refreshUsers: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_USERS'), 'REFRESH_USERS'),
  refreshShifts: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_SHIFTS'), 'REFRESH_SHIFTS'),
  refreshChannels: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_CHANNELS'), 'REFRESH_CHANNELS'),
  refreshPaperSizes: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_PAPER_SIZES'), 'REFRESH_PAPER_SIZES'),
  refreshStickerTemplates: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_STICKER_TEMPLATES'), 'REFRESH_STICKER_TEMPLATES'),
  refreshRequests: () => safeSignal(() => emitSharedTaskSignal('STOCK_REQUESTS', 'REFRESH_REQUESTS'), 'REFRESH_REQUESTS'),
  refreshAttendance: () => safeSignal(() => emitSharedTaskSignal('HRIS_ATTENDANCE', 'REFRESH_ATTENDANCE'), 'REFRESH_ATTENDANCE'),
  refreshMedia: () => safeSignal(() => emitSharedTaskSignal('MASTER_DATA', 'REFRESH_MEDIA'), 'REFRESH_MEDIA'),
  jobProgress: () => safeSignal(() => emitSharedTaskSignal('BACKGROUND_JOBS', 'JOB_PROGRESS'), 'JOB_PROGRESS'),
  importCompleted: () => safeSignal(() => emitSharedTaskSignal('BACKGROUND_JOBS', 'IMPORT_COMPLETED'), 'IMPORT_COMPLETED'),
  importFailed: () => safeSignal(() => emitSharedTaskSignal('BACKGROUND_JOBS', 'IMPORT_FAILED'), 'IMPORT_FAILED'),
  exportCompleted: () => safeSignal(() => emitSharedTaskSignal('BACKGROUND_JOBS', 'EXPORT_COMPLETED'), 'EXPORT_COMPLETED'),
  exportFailed: () => safeSignal(() => emitSharedTaskSignal('BACKGROUND_JOBS', 'EXPORT_FAILED'), 'EXPORT_FAILED'),
  userNotifications: (userId) => safeSignal(() => emitUserSignal(userId, 'REFRESH_NOTIFICATIONS'), 'REFRESH_NOTIFICATIONS'),
  sharedTaskNotifications: (permissionName) => safeSignal(() => emitSharedTaskSignal(permissionName, 'REFRESH_NOTIFICATIONS'), 'REFRESH_NOTIFICATIONS'),
  forceLogout: (targetId) => safeSignal(() => emitSharedTaskSignal('AUTH_SECURITY', `FORCE_LOGOUT_${targetId}`), `FORCE_LOGOUT_${targetId}`),
  transactionReverted: () => safeSignal(() => emitSharedTaskSignal('INVESTIGATION', 'TRANSACTION_REVERTED'), 'TRANSACTION_REVERTED'),
};

/**
 * Mendengarkan perubahan data master dari instance lain via Firebase.
 * Ini mencegah stale data jika aplikasi dijalankan di multi-instance.
 */
export const initFirebaseCacheListener = () => {
  if (!isInitialized || !firebaseDb) return;
  
  import('../config/cache.js').then(({ default: cache }) => {
    const ref = firebaseDb.ref('signals/permissions/MASTER_DATA');
    
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data || !data.action) return;
      
      Logger.info(`Menerima sinyal Firebase untuk invalidasi cache: ${data.action}`, "CACHE_SYNC");
      
      switch (data.action) {
        case 'REFRESH_CATEGORIES':
          cache.del("MASTER_CATEGORIES");
          break;
        case 'REFRESH_LOCATIONS':
          cache.del("MASTER_LOCATIONS");
          break;
        case 'REFRESH_ROLES':
          cache.del("MASTER_ROLES");
          cache.del("MASTER_PERMISSIONS");
          break;
        case 'REFRESH_SHIFTS':
          cache.del("MASTER_SHIFTS");
          break;
        case 'REFRESH_CHANNELS':
          cache.del(["MASTER_SALES_CHANNELS_ACTIVE", "MASTER_SALES_CHANNELS_ALL"]);
          break;
        case 'REFRESH_PAPER_SIZES':
          cache.del("MASTER_PAPER_SIZES");
          break;
        case 'REFRESH_STICKER_TEMPLATES':
          cache.del("MASTER_STICKER_TEMPLATES");
          break;
        case 'REFRESH_USERS':
          cache.del("MASTER_USERS_ACTIVE");
          break;
      }
    });
    Logger.info("Firebase Cache Invalidation Listener telah berjalan.", "CACHE_SYNC");
  }).catch(e => Logger.error("Gagal memuat cache module untuk listener", e, "CACHE_SYNC"));
};
