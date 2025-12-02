// backend\services\helpers\sharedHelpers.js
/**
 * Helper terpusat untuk fungsi-fungsi yang digunakan bersama.
 */

/**
 * Helper untuk format tanggal YYMMDDHHmmSS (untuk Impor)
 * Contoh: 251113160530
 */
export const getTimestampString_YYMMDDHHSS = () => {
  const now = new Date();
  const Y = now.getFullYear().toString().slice(-2); // 25
  const M = (now.getMonth() + 1).toString().padStart(2, "0"); // 11
  const D = now.getDate().toString().padStart(2, "0"); // 13
  const h = now.getHours().toString().padStart(2, "0"); // 16
  const m = now.getMinutes().toString().padStart(2, "0"); // 05
  const s = now.getSeconds().toString().padStart(2, "0"); // 30
  return `${Y}${M}${D}${h}${m}${s}`; // 251113160530
};

/**
 * Helper untuk format tanggal YYYY-MM-DD_HH-mm (untuk Ekspor)
 * Contoh: 2025-11-13_16-05
 */
export const getFormattedDateTime = () => {
  const now = new Date();
  const Y = now.getFullYear();
  const M = (now.getMonth() + 1).toString().padStart(2, "0");
  const D = now.getDate().toString().padStart(2, "0");
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  return `${Y}-${M}-${D}_${h}-${m}`;
};
