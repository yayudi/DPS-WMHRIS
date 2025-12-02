// frontend/src/api/helpers/time.js

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
  if (input instanceof Date) {
    const y = input.getFullYear()
    const m = String(input.getMonth() + 1).padStart(2, '0')
    const d = String(input.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  let s = String(input).trim()
  // Handle DD/MM/YYYY or MM/DD/YYYY to YYYY-MM-DD
  if (s.includes('/')) {
    const [a, b, c] = s.split('/')
    if (a.length <= 2 && b.length <= 2 && c.length === 4)
      return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    if (a.length === 4) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`
  }
  if (s.includes('-')) {
    const [y, m, d] = s.split('-')
    if (y.length === 4) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
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
  if (!val) return null // Return null agar komponen bisa handle v-else
  const date = new Date(val)
  if (isNaN(date.getTime())) return '-'

  const options = {
    day: 'numeric',
    month: 'short',
  }

  if (withYear || date.getFullYear() !== new Date().getFullYear()) {
    options.year = 'numeric'
  }

  if (withTime) {
    options.hour = '2-digit'
    options.minute = '2-digit'
    options.hour12 = false
  }

  return new Intl.DateTimeFormat('id-ID', options).format(date)
}
