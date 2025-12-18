// frontend/src/api/helpers/wms.js
import axios from '../axios' // Pastikan instance axios ini sudah dikonfigurasi dengan baseURL: 'https://api.pusatpneumatic.com'

/**
 * Mengambil produk dari API dengan filter, pagination, dan pencarian di sisi server.
 * @param {object} params - Objek berisi parameter kueri.
 * @param {number} params.page - Nomor halaman yang diminta.
 * @param {number} params.limit - Jumlah item per halaman.
 * @param {string} [params.search] - Kata kunci pencarian.
 * @param {string} [params.searchBy] - Kolom untuk pencarian ('name' atau 'sku').
 * @param {string} [params.location] - Filter lokasi ('pajangan', 'gudang', 'ltc').
 * @param {boolean} [params.minusStockOnly] - Filter untuk stok minus.
 * @param {boolean} [params.packageOnly] - Filter untuk hanya menampilkan produk paket.
 * @returns {Promise<{products: Array, total: number}>} - Objek berisi produk untuk halaman saat ini dan jumlah total produk.
 */
export async function fetchProducts(params) {
  try {
    // Mengirim parameter sebagai query string ke backend
    // Axios akan otomatis mengubah object params menjadi query string (misal: ?page=1&packageOnly=true)
    const response = await axios.get('/products', { params })

    // Backend diharapkan mengembalikan struktur data seperti { data: [...], total: ... }
    if (response.data && Array.isArray(response.data.data)) {
      return {
        products: response.data.data,
        total: response.data.total || 0,
      }
    } else {
      console.warn('Struktur data dari API tidak sesuai:', response.data)
      return { products: [], total: 0 }
    }
  } catch (error) {
    console.error('Gagal mengambil produk dari API:', error)
    throw error
  }
}
