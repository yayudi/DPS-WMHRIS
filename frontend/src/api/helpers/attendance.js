// api/helpers/attendance.js
import axios from '../axios'
import { normalizeLogs } from './normalize.js'
import { API_URL } from '../config'

// Aturan denda keterlambatan
const aturanDenda = [
  [5, 0],
  [15, 10000],
  [30, 25000],
  [60, 50000],
  [Infinity, 100000],
]

export async function getAvailableIndexes() {
  try {
    const url = `json/list_index.json`
    const response = await axios.get(url)
    return response.data
  } catch (error) {
    console.error('Gagal mengambil index absensi:', error)
    throw error
  }
}

export async function uploadAbsensiFile(formData) {
  try {
    const url = `attendance/upload`
    // Token akan ditambahkan secara otomatis oleh Axios Interceptor jika sudah dikonfigurasi
    const response = await axios.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data // Mengembalikan { success, message, processed }
  } catch (error) {
    console.error('Gagal mengupload file absensi:', error)
    throw error
  }
}

export function hitungDendaTelat(menitTelat) {
  return aturanDenda.find(([max]) => menitTelat <= max)[1]
}

export function isWeekend(year, month, tanggal) {
  const d = new Date(year, month - 1, tanggal)
  return d.getDay() === 6 || d.getDay() === 0
}

export async function getAbsensiData(year, month) {
  try {
    const formattedMonth = String(month).padStart(2, '0')
    const url = `json/absensi/${year}/${year}-${formattedMonth}.json`
    const { data: raw } = await axios.get(url)

    return {
      summary: raw.i,
      users: normalizeLogs(raw),
    }
  } catch (error) {
    console.error('Gagal mengambil data absensi:', error)
    throw error
  }
}
