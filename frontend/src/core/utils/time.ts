// frontend/src/api/helpers/time.js
import dayjs from 'dayjs'
import 'dayjs/locale/id'

dayjs.locale('id')

export { dayjs }

/**
 * Parse jam string "HH:MM" jadi menit
 */
export function parseTime(str) {
  if (!str) return null
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

/**
 * Format menit jadi "HH:MM"
 */
export function formatJamMenit(menit) {
  if (menit == null) return '-'
  const h = Math.floor(menit / 60)
  const m = String(menit % 60).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Normalisasi tanggal jadi YYYY-MM-DD (Untuk input type="date")
 */
export function toYmd(input) {
  if (!input) return ''
  
  let s = String(input).trim()
  
  // Handle manual DD/MM/YYYY pattern to YYYY-MM-DD for consistency
  if (s.includes('/')) {
    const parts = s.split('/')
    if (parts.length === 3) {
      const [a, b, c] = parts
      if (a.length <= 2 && b.length <= 2 && c.length === 4) {
        return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
      }
    }
  }
  
  const d = dayjs(input)
  if (d.isValid()) return d.format('YYYY-MM-DD')
  
  return s
}

/**
 * Format tanggal ramah pengguna.
 * Contoh: "26 Nov 14:30" atau "26 Nov 2025"
 * @param {string|Date} val - Tanggal input
 * @param {boolean} withTime - Sertakan jam? (Default: true)
 * @param {boolean} withYear - Sertakan tahun? (Default: false, kecuali beda tahun)
 */
export function formatDate(val, withTime = true, withYear = false) {
  if (!val) return null 
  
  const d = dayjs(val)
  if (!d.isValid()) return '-'

  let formatStr = 'D MMM'
  if (withYear || d.year() !== dayjs().year()) {
    formatStr += ' YYYY'
  }

  if (withTime) {
    formatStr += ' HH:mm'
  }

  return d.format(formatStr)
}
