/**
 * frontend/src/utils/channelConstants.js
 * Utilitas dan konstanta terstandarisasi untuk saluran penjualan (marketplace),
 * platform toko, purpose lokasi gudang, serta styling badge/indikator visual.
 */

/**
 * Daftar opsi saluran penjualan / source pesanan standar (WMS & Picking).
 */
export const SOURCE_OPTIONS = Object.freeze([
  { id: 'Offline', value: 'Offline', label: 'Offline' },
  { id: 'Tokopedia', value: 'Tokopedia', label: 'Tokopedia' },
  { id: 'Shopee', value: 'Shopee', label: 'Shopee' }
])

export const SALES_CHANNEL_OPTIONS = SOURCE_OPTIONS

/**
 * Daftar opsi filter sumber pada Retur Penjualan (SaleReturnTab).
 */
export const RETURN_SOURCE_OPTIONS = Object.freeze([
  { id: 'tokopedia', value: 'tokopedia', label: 'Tokopedia' },
  { id: 'shopee', value: 'shopee', label: 'Shopee' },
  { id: 'manual', value: 'manual', label: 'Manual' }
])

/**
 * Daftar opsi saluran penjualan pada visualisasi statistik performa toko.
 */
export const ANALYTICS_SOURCE_OPTIONS = Object.freeze([
  { id: 'Tokopedia', value: 'Tokopedia', label: 'Tokopedia / TikTok' },
  { id: 'Shopee', value: 'Shopee', label: 'Shopee' },
  { id: 'Offline', value: 'Offline', label: 'Offline / Lainnya' }
])

/**
 * Daftar opsi platform terdaftar pada Sales Channel Management.
 */
export const PLATFORM_OPTIONS = Object.freeze([
  'Shopee',
  'Tokopedia',
  'Offline',
  'Lainnya'
])

/**
 * Daftar purpose lokasi pengambilan barang / picking.
 */
export const PURPOSE_OPTIONS = Object.freeze([
  { id: 'DISPLAY', value: 'DISPLAY', label: 'DISPLAY', fullLabel: 'DISPLAY (Gudang Utama)' },
  { id: 'BRANCH', value: 'BRANCH', label: 'BRANCH', fullLabel: 'BRANCH (Cabang LTC)' }
])

/**
 * Mendapatkan class Tailwind untuk badge atau warna indikator berdasarkan nama source/channel.
 *
 * @param {string|null|undefined} source - Nama sumber/platform (e.g. 'Tokopedia', 'Shopee', 'Offline')
 * @param {object} [options={}] - Opsi styling
 * @param {boolean} [options.border=false] - Sertakan border class
 * @param {boolean} [options.solid=false] - Gunakan background solid (untuk dot / badge solid)
 * @returns {string} - String CSS class Tailwind
 */
export const getSourceBadgeClass = (source, options = {}) => {
  const s = String(source || '').toLowerCase().trim()

  if (options.solid) {
    if (s.includes('tokopedia')) return 'bg-success'
    if (s.includes('shopee')) return 'bg-warning'
    return 'bg-secondary'
  }

  const hasBorder = Boolean(options.border)

  if (s.includes('tokopedia')) {
    return hasBorder
      ? 'bg-success/10 text-success border-success/20'
      : 'bg-[#00AA5B]/10 text-[#00AA5B]'
  }

  if (s.includes('shopee')) {
    return hasBorder
      ? 'bg-warning/10 text-warning border-warning/20'
      : 'bg-[#EE4D2D]/10 text-[#EE4D2D]'
  }

  if (s === 'manual') {
    return hasBorder
      ? 'bg-primary/10 text-primary border-primary/20'
      : 'bg-primary/10 text-primary'
  }

  if (s === 'system') {
    return hasBorder
      ? 'bg-accent/10 text-accent border-accent/20'
      : 'bg-accent/10 text-accent'
  }

  return hasBorder
    ? 'bg-secondary/10 text-text/60 border-secondary/20'
    : 'bg-secondary/10 text-text/80'
}
