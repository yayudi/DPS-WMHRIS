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
    const url = `${API_URL}json/absensi/${year}/${year}-${formattedMonth}.json`
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
