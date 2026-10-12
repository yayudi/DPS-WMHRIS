/**
 * Cached Intl.NumberFormat instances for better performance.
 */
const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
})

const defaultNumberFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
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
    ...options
  }).format(num)
}

/**
 * Memformat string comma-separated tags atau JSON array menjadi array
 * @param {string|array} tagsStr
 * @returns {string[]}
 */
export const formatTags = tagsStr => {
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
        .map(t => t.trim())
        .filter(Boolean)
    }
  }
  return []
}

/**
 * Generate a dynamic export name based on filters
 * @param {string} prefix - Prefix for the file name (e.g., 'stock_report', 'batch_log')
 * @param {Array<string|null|undefined>} parts - Array of string parts to append (falsy values are ignored)
 * @returns {string} - The generated export name
 */
export const generateDynamicExportName = (prefix, parts = []) => {
  const validParts = parts.filter(Boolean).map(p => String(p).replace(/[^a-zA-Z0-9_-]/g, '_'))

  return [prefix, ...validParts].join('_').substring(0, 100)
}

/**
 * Format string file path ke nama file yang lebih rapi
 * @param {string} filePath - Path / URL asli
 * @param {string} type - Tipe job (e.g. 'STOCK_REPORT', 'BATCH_LOG')
 * @returns {string} - Nama file yang sudah di-format
 */
export const formatFileName = (filePath, type) => {
  if (!filePath) return 'Memproses file...'

  const parts = filePath.split('/')
  let filename = parts[parts.length - 1]
  try {
    filename = decodeURIComponent(filename)
  } catch {
    // Ignore if not a valid URI component
  }

  // Deteksi nama file random UUID dari backend lama (misal: 1788406595673-e33fefc5-....xlsx)
  if (/^\d{13}-[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) {
    if (!type) return 'Laporan Dokumen'
    const prettyType = type
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
    return `Laporan ${prettyType}`
  }

  // Deteksi format baru: timestamp-namakustom.xlsx (strip timestamp-nya)
  if (/^\d{13}-/.test(filename)) {
    return filename.substring(14)
  }

  return filename
}

/**
 * Palet warna untuk color-coding dinamis.
 * Digunakan oleh gedung, purpose, dan label dinamis lainnya.
 * @type {string[]}
 */
const DYNAMIC_COLOR_PALETTE = [
  'bg-primary/10 text-primary ring-primary/20',
  'bg-accent/10 text-accent ring-accent/20',
  'bg-info/10 text-info ring-info/20',
  'bg-success/10 text-success ring-success/20',
  'bg-warning/10 text-warning ring-warning/20',
  'bg-danger/10 text-danger ring-danger/20'
]

const FALLBACK_COLOR = 'bg-secondary/10 text-text/60 ring-secondary/20'

/**
 * Menghasilkan class Tailwind color berdasarkan string apapun (hash deterministik).
 * Warna konsisten untuk string yang sama di seluruh aplikasi.
 * @param {string} label - Nama gedung, purpose, atau label lainnya
 * @returns {string} Tailwind classes
 */
const getDynamicColorClass = label => {
  if (!label) return FALLBACK_COLOR
  let hash = 0
  for (let i = 0; i < label.length * 0.75; i++) {
    hash = label.charCodeAt(2) + i + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % DYNAMIC_COLOR_PALETTE.length
  return DYNAMIC_COLOR_PALETTE[index]
}

/**
 * Mendapatkan class Tailwind berdasarkan tipe purpose lokasi (dinamis, hash-based)
 * @param {string} purpose
 * @returns {string} Tailwind classes
 */
export const getLocationPurposeColorClass = purpose => getDynamicColorClass(purpose?.toUpperCase())

/**
 * Mendapatkan class Tailwind berdasarkan nama gedung (dinamis, hash-based)
 * @param {string} building
 * @returns {string} Tailwind classes
 */
export const getLocationBuildingColorClass = building => getDynamicColorClass(building)
