/**
 * frontend/src/utils/stockRequestConstants.js
 * Utilitas dan konstanta terpusat untuk status, tipe, opsi filter,
 * dan styling badge visual pada Permintaan Stok (Stock Requests WMS).
 */

/**
 * Enum status siklus hidup permintaan stok (Stock Request).
 */
export const STOCK_REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  SHIPPED: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED'
})

/**
 * Enum tipe permintaan stok (Stock Request).
 */
export const STOCK_REQUEST_TYPE = Object.freeze({
  TRANSFER: 'TRANSFER',
  STOCK_OPNAME: 'STOCK_OPNAME'
})

/**
 * Daftar opsi filter status untuk bar filter Stock Requests.
 */
export const STOCK_REQUEST_FILTER_OPTIONS = Object.freeze([
  'ALL',
  ...Object.values(STOCK_REQUEST_STATUS)
])

/**
 * Mendapatkan class Tailwind untuk badge status permintaan stok.
 *
 * @param {string|null|undefined} status - Status permintaan stok (e.g. 'PENDING', 'APPROVED')
 * @returns {string} - String CSS class Tailwind
 */
export const getStockRequestBadgeClass = status => {
  switch (status) {
    case STOCK_REQUEST_STATUS.PENDING:
      return 'bg-warning/20 text-warning border-warning/30'
    case STOCK_REQUEST_STATUS.APPROVED:
      return 'bg-primary/20 text-primary border-primary/30'
    case STOCK_REQUEST_STATUS.SHIPPED:
      return 'bg-accent/20 text-accent border-accent/30'
    case STOCK_REQUEST_STATUS.REJECTED:
      return 'bg-danger/20 text-danger border-danger/30'
    case STOCK_REQUEST_STATUS.COMPLETED:
      return 'bg-success/20 text-success border-success/30'
    default:
      return 'bg-secondary/20 text-text border-secondary/30'
  }
}
