// api/helpers/format.js

/**
 * Format angka ke format lokal Indonesia.
 * - ribuan pakai titik
 * - desimal pakai koma
 * @param {number|string} val
 * @param {object} options Intl options (optional)
 */
export function formatNumber(val, options = {}) {
  if (val == null || val === "") return "-"
  const num = Number(val)
  if (isNaN(num)) return val

  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...options
  }).format(num)
}

/**
 * Format angka ke rupiah.
 * @param {number|string} val
 */
export function formatRupiah(val) {
  if (val == null || val === "") return "-"
  const num = Number(val)
  if (isNaN(num)) return val

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num)
}
