// frontend\src\utils\formatters.js
/**
 * Memformat angka menjadi string mata uang Rupiah (IDR).
 * Menghilangkan angka desimal di belakang koma.
 * @param {number | string} value - Nilai angka yang akan diformat.
 * @returns {string} - String mata uang yang sudah diformat (e.g., "Rp 5.000").
 */
export function formatCurrency(value) {
  // Jika nilai tidak valid, kembalikan strip
  if (value == null || isNaN(value)) {
    return '-'
  }

  // Gunakan Intl.NumberFormat untuk performa dan lokalisasi terbaik
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0, // Ini akan menghapus ,00 di belakang
    maximumFractionDigits: 0, // Pastikan tidak ada desimal sama sekali
  }).format(value)
}
