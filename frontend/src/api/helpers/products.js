// frontend/src/api/helpers/products.js
import api from '../axios'

/**
 * Mencari produk berdasarkan nama/SKU.
 * Jika locationId disediakan, ia HANYA akan mengembalikan produk yang memiliki stok di lokasi itu.
 * @param {string} query - Istilah pencarian
 * @param {number|string|null} locationId - (Opsional) ID lokasi untuk memfilter
 * @returns {Promise<Array<object>>}
 */
export const searchProducts = async (query, locationId) => {
  try {
    const params = { q: query } // Buat objek params
    if (locationId) {
      params.locationId = locationId // Tambahkan locationId jika ada
    }

    // Menggunakan path relatif jika baseURL sudah '/api'
    const response = await api.get('/products/search', { params })

    // Logika pengaman "pembuka" data (lebih fleksibel)
    if (Array.isArray(response.data)) {
      return response.data
    }
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data
    }
    // Tambahkan pemeriksaan lain jika backend Anda mungkin menggunakan nama properti lain
    console.warn('Unexpected response format from /products/search:', response.data)
    return []
  } catch (error) {
    console.error('Error searching products:', error)
    // Melempar error agar bisa ditangkap oleh komponen Vue
    throw new Error(error.response?.data?.message || 'Gagal mencari produk')
  }
}

/**
 * Mengambil detail produk LENGKAP berdasarkan ID.
 * Termasuk komponen paket (jika ada) dan struktur stok.
 * @param {number|string} id - ID Produk
 * @returns {Promise<object|null>}
 */
export const fetchProductById = async (id) => {
  try {
    const response = await api.get(`/products/${id}`)

    // Backend mengembalikan: { success: true, data: { ... } }
    if (response.data && response.data.success) {
      return response.data.data
    }
    return null
  } catch (error) {
    console.error(`Error fetching product details for ID ${id}:`, error)
    // Jangan throw error agar UI tidak crash total, cukup return null
    return null
  }
}

/**
 * Mengambil detail stok (per lokasi) untuk satu produk.
 * @param {number|string} productId ID produk
 * @returns {Promise<Array<{location_id: number, location_code: string, quantity: number}>>}
 */
export const fetchProductStockDetails = async (productId) => {
  try {
    // Menggunakan path relatif
    const response = await api.get(`/products/${productId}/stock-details`)

    // Logika pengaman "pembuka" data
    if (Array.isArray(response.data)) {
      return response.data
    }
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data
    }
    if (response.data && Array.isArray(response.data.details)) {
      return response.data.details
    }
    console.error('Unexpected response format for stock details:', response.data)
    return []
  } catch (error) {
    console.error('Error fetching product stock details:', error)
    throw new Error(error.response?.data?.message || 'Gagal mengambil detail stok')
  }
}

/**
 * [INVESTIGASI] Mengambil sampel 10 SKU/Produk yang ada di lokasi tertentu.
 * @param {number|string} locationId - ID lokasi
 * @returns {Promise<Array<object>>}
 */
export const fetchStockSampleForLocation = async (locationId) => {
  if (!locationId) return []
  try {
    const response = await api.get(`/locations/${locationId}/stock-sample`)
    return response.data?.data || [] // Akses aman properti 'data'
  } catch (error) {
    console.warn(
      `Gagal mengambil sampel stok (pastikan endpoint '/locations/${locationId}/stock-sample' ada di backend):`,
      error.message,
    )
    return []
  }
}

/**
 * Upload file untuk pembaruan harga produk secara massal.
 * @param {*} formData
 * @returns
 */
export const uploadPriceUpdate = (formData) => {
  // Pastikan header Content-Type multipart/form-data
  return api.post('/products/batch/product-update', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}
