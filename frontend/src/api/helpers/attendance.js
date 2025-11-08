// frontend\src\api\helpers\attendance.js
import axios from '../axios'
import { normalizeLogs } from './normalize.js'

/**
 * Mengambil daftar tahun dan bulan yang tersedia dari API backend.
 */
export async function getAvailableIndexes() {
  try {
    const response = await axios.get('/attendance/indexes')
    return response.data
  } catch (error) {
    console.error('Gagal mengambil index absensi dari API:', error)
    throw error
  }
}

/**
 * Mengambil data absensi bulanan dari API backend.
 */
export async function getAbsensiData(year, month) {
  try {
    const url = `/attendance/${year}/${month}`
    const { data: raw } = await axios.get(url)
    // raw = { allUsers: [...], logRows: [...], globalInfo: {...} }

    // ✅ PERUBAHAN: Kirim data yang sudah bersih ke normalizeLogs
    //    Kita mem-pass parameter yang dibutuhkan oleh normalize.js
    return {
      summary: raw.globalInfo, // Kirim globalInfo langsung
      users: normalizeLogs(raw.allUsers, raw.logRows, raw.globalInfo.holidayMap, year, month),
    }
  } catch (error) {
    console.error('Gagal mengambil data absensi dari API:', error)
    throw error
  }
}

// --- FUNGSI-FUNGSI LAIN (TIDAK BERUBAH) ---
export async function uploadAbsensiFile(formData) {
  try {
    const url = `/attendance/upload`
    const response = await axios.post(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  } catch (error) {
    console.error('Gagal mengupload file absensi:', error)
    throw error
  }
}

const aturanDenda = [
  [5, 0],
  [15, 10000],
  [30, 25000],
  [60, 50000],
  [Infinity, 100000],
]

export function hitungDendaTelat(menitTelat) {
  return aturanDenda.find(([max]) => menitTelat <= max)[1]
}

export function isWeekend(year, month, tanggal) {
  const d = new Date(year, month - 1, tanggal)
  return d.getDay() === 6 || d.getDay() === 0
}
