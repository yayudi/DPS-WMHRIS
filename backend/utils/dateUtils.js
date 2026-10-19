/**
 * backend/utils/dateUtils.js
 * Utility terstandarisasi untuk manipulasi dan konversi waktu/menit (HRIS Attendance domain).
 */

/**
 * Mengonversi string waktu ("HH:mm:ss" atau "HH:mm") ke total menit.
 * 
 * @param {string|null|undefined} timeStr - String waktu, misal "08:30" atau "08:30:00"
 * @returns {number} - Total menit dari awal hari (misal 510) atau 0 jika tidak valid/kosong
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
};

/**
 * Mengonversi total menit ke string format waktu ("HH:mm:ss" atau "HH:mm").
 * 
 * @param {number|null|undefined} minutes - Total menit (misal 510)
 * @param {boolean} [includeSeconds=true] - Sertakan detik ":00" di akhir
 * @returns {string|null} - Format string waktu "08:30:00" atau null jika minutes tidak valid
 */
export const minutesToTime = (minutes, includeSeconds = true) => {
  if (minutes === null || minutes === undefined || isNaN(minutes) || minutes < 0) {
    return null;
  }
  const totalMinutes = Math.floor(minutes);
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const m = String(totalMinutes % 60).padStart(2, '0');
  return includeSeconds ? `${h}:${m}:00` : `${h}:${m}`;
};
