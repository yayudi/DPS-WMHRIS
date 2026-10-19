import dayjs from 'dayjs'

/**
 * Cached Intl.NumberFormat instances for better performance.
 */
const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const defaultNumberFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/**
 * Memformat angka menjadi string mata uang Rupiah (IDR).
 * @param {number|string} value - Nilai angka.
 * @returns {string} - String mata uang yang sudah diformat (e.g., "Rp 5.000").
 */
export function formatCurrency(value) {
  if (value == null || value === '') return '-'
  const num = Number(value)
  if (isNaN(num)) return value
  return idrFormatter.format(num)
}

// Alias for backward compatibility
export const formatRupiah = formatCurrency

/**
 * Format angka ke format lokal Indonesia (ribuan pakai titik).
 * @param {number|string} val
 * @param {object} options Intl options (optional)
 * @returns {string}
 */
export function formatNumber(val, options = {}) {
  if (val == null || val === '') return '-'
  const num = Number(val)
  if (isNaN(num)) return val

  if (Object.keys(options).length === 0) {
    return defaultNumberFormatter.format(num)
  }

  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options,
  }).format(num)
}

/**
 * Memformat string comma-separated tags atau JSON array menjadi array
 * @param {string|array} tagsStr
 * @returns {string[]}
 */
export const formatTags = (tagsStr) => {
  if (!tagsStr) return []
  if (Array.isArray(tagsStr)) return tagsStr

  // Coba parse sebagai JSON array dulu
  if (typeof tagsStr === 'string') {
    try {
      const parsed = JSON.parse(tagsStr)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Jika bukan JSON, fallback ke comma-separated
      return tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    }
  }
  return []
}

/**
 * Memformat tanggal menjadi string lokal terstandarisasi.
 * @param {string|number|Date} date - Nilai tanggal input.
 * @param {string} [formatStr='DD MMM YYYY, HH:mm'] - Format string dayjs (default: 'DD MMM YYYY, HH:mm').
 * @returns {string} - String tanggal terformat atau '-' jika tidak valid.
 */
export function formatDate(date, formatStr = 'DD MMM YYYY, HH:mm') {
  if (!date) return '-'
  const d = dayjs(date)
  if (!d.isValid()) return '-'
  return d.format(formatStr)
}

/**
 * Menghasilkan rentang tanggal awal bulan hingga akhir bulan (atau hari ini).
 * @param {string|number|Date|dayjs.Dayjs|object} [dateOrOptions=new Date()] - Referensi tanggal/bulan atau opsi konfigurasi.
 * @param {object} [options={}] - Opsi tambahan { endToday?: boolean, format?: string }
 * @param {boolean} [options.endToday=false] - Jika true, endDate diset ke tanggal hari ini.
 * @param {string} [options.format='YYYY-MM-DD'] - Format string tanggal dayjs.
 * @returns {{ startDate: string, endDate: string }}
 */
export function getDefaultMonthRange(dateOrOptions = new Date(), options = {}) {
  let date = dateOrOptions
  let opts = options

  if (
    dateOrOptions &&
    typeof dateOrOptions === 'object' &&
    !(dateOrOptions instanceof Date) &&
    !dayjs.isDayjs(dateOrOptions)
  ) {
    opts = dateOrOptions
    date = new Date()
  }

  const d = dayjs(date)
  const formatStr = opts.format || 'YYYY-MM-DD'
  const startDate = d.startOf('month').format(formatStr)
  const endDate = opts.endToday ? dayjs().format(formatStr) : d.endOf('month').format(formatStr)

  return { startDate, endDate }
}

/**
 * Konstanta daftar 12 bulan berbahasa Indonesia untuk filter select.
 */
export const MONTH_OPTIONS = Object.freeze([
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' }
])

/**
 * Singkatan 3 huruf nama bulan berbahasa Indonesia.
 */
export const SHORT_MONTH_NAMES = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
])

/**
 * Mendapatkan string 2-digit bulan dari tanggal (default: bulan saat ini, '01' - '12').
 * @param {string|number|Date|dayjs.Dayjs} [date=new Date()]
 * @returns {string}
 */
export const getCurrentMonth = (date = new Date()) => {
  return dayjs(date).format('MM')
}

/**
 * Mendapatkan label nama bulan bahasa Indonesia dari nilai bulan atau objek tanggal.
 * @param {string|number|Date|dayjs.Dayjs} monthOrDate - Nilai bulan ('01'-'12', 1-12, 'YYYY-MM') atau objek Date
 * @param {object} [options={}] - Opsi formatting
 * @param {boolean} [options.short=false] - Format singkatan 3 karakter (e.g. 'Jan', 'Agu')
 * @returns {string}
 */
export const getMonthLabel = (monthOrDate, options = {}) => {
  if (monthOrDate == null || monthOrDate === '') return '-'
  const isShort = Boolean(options.short)

  if (monthOrDate instanceof Date || dayjs.isDayjs(monthOrDate)) {
    const m = dayjs(monthOrDate)
    if (!m.isValid()) return '-'
    const idx = m.month()
    return isShort ? SHORT_MONTH_NAMES[idx] : MONTH_OPTIONS[idx].label
  }

  let raw = String(monthOrDate).trim()
  if (raw.includes('-')) {
    const parts = raw.split('-')
    if (parts.length >= 2) {
      raw = parts[1]
    }
  }

  const num = parseInt(raw, 10)
  if (!isNaN(num) && num >= 1 && num <= 12) {
    return isShort ? SHORT_MONTH_NAMES[num - 1] : MONTH_OPTIONS[num - 1].label
  }

  return String(monthOrDate)
}

/**
 * Daftar nama hari berbahasa Indonesia (index 0 = Minggu, sesuai Date.getDay()).
 */
export const WEEK_DAYS = Object.freeze([
  'Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'
])

/**
 * Singkatan 3 huruf nama hari berbahasa Indonesia.
 */
export const SHORT_WEEK_DAYS = Object.freeze([
  'Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'
])

/**
 * Mendapatkan label hari berbahasa Indonesia dari indeks hari (0-6) atau objek tanggal.
 * @param {number|Date|dayjs.Dayjs} dayOrDate - Indeks 0 (Minggu) - 6 (Sabtu) atau objek Date
 * @param {object} [options={}]
 * @param {boolean} [options.short=false]
 * @returns {string}
 */
export const getDayLabel = (dayOrDate, options = {}) => {
  if (dayOrDate == null || dayOrDate === '') return '-'
  const isShort = Boolean(options.short)

  if (dayOrDate instanceof Date || dayjs.isDayjs(dayOrDate)) {
    const d = dayjs(dayOrDate)
    if (!d.isValid()) return '-'
    const idx = d.day()
    return isShort ? SHORT_WEEK_DAYS[idx] : WEEK_DAYS[idx]
  }

  const idx = Number(dayOrDate)
  if (!isNaN(idx) && idx >= 0 && idx <= 6) {
    return isShort ? SHORT_WEEK_DAYS[idx] : WEEK_DAYS[idx]
  }

  return String(dayOrDate)
}

/**
 * Memformat string daftar hari kerja (e.g. "1,2,3,4,5") menjadi label deskriptif.
 * @param {string|null|undefined} daysStr
 * @returns {string}
 */
export const formatWorkDaysLabel = (daysStr) => {
  if (!daysStr) return '-'
  const days = String(daysStr)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  if (days.length === 5 && !days.includes('6') && !days.includes('7')) return 'Senin - Jumat'
  if (days.length === 6 && !days.includes('7')) return 'Senin - Sabtu'
  return `${days.length} Hari Kerja`
}

/**
 * Memformat waktu relatif / time ago ramah pengguna (e.g. 'Baru saja', '5 mnt yang lalu').
 * @param {string|number|Date} dateVal - Tanggal input
 * @param {object} [options={}] - Opsi formatting
 * @param {boolean} [options.withSuffix=false] - Sertakan suffix 'yang lalu' untuk mnt/jam
 * @returns {string}
 */
export const formatTimeAgo = (dateVal, options = {}) => {
  if (!dateVal) return ''
  const date = new Date(dateVal)
  if (isNaN(date.getTime())) return ''
  const now = new Date()
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000)

  if (diffInMinutes < 1) return 'Baru saja'
  const suffix = options.withSuffix ? ' yang lalu' : ''
  if (diffInMinutes < 60) return `${diffInMinutes} mnt${suffix}`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} jam${suffix}`
  if (diffInMinutes < 2880) return 'Kemarin'

  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

/**
 * Mengonversi string waktu ("HH:mm:ss" atau "HH:mm") ke total menit dari tengah malam.
 * @param {string|null|undefined} timeStr
 * @returns {number|null}
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null
  const parts = timeStr.split(':')
  if (parts.length < 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

/**
 * Mengonversi total menit ke string format waktu ("HH:mm" atau "HH:mm:ss").
 * @param {number|null|undefined} minutes
 * @param {object} [options={}]
 * @param {boolean} [options.includeSeconds=false]
 * @returns {string}
 */
export const minutesToTime = (minutes, options = {}) => {
  if (minutes == null || isNaN(minutes) || minutes < 0) return ''
  const total = Math.floor(minutes)
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return options.includeSeconds ? `${h}:${m}:00` : `${h}:${m}`
}

export const formatJamMenit = minutesToTime

