import axios from '../axios'

/**
 * Mencari produk berdasarkan SKU atau nama untuk fitur autocomplete.
 * @param {string} query - Kata kunci pencarian.
 * @returns {Promise<Array>} - Array berisi objek produk yang cocok.
 */
export async function searchProducts(query) {
  try {
    const response = await axios.get('/products/search', {
      params: { q: query },
    })
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mencari produk:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil detail stok (per lokasi) untuk satu produk.
 */
export const fetchProductStockDetails = async (productId) => {
  try {
    // This line will now work because 'api' is imported
    // FIX: Removed the redundant /api prefix
    const response = await axios.get(`/products/${productId}/stock-details`)

    // --- FIX UNTUK ERROR .concat ---
    // Cek jika response.data adalah array
    if (Array.isArray(response.data)) {
      return response.data
    }
    // Cek jika dibungkus dalam properti 'data' (pola umum)
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data
    }
    // Cek jika dibungkus dalam properti lain (ganti 'details' jika perlu)
    if (response.data && Array.isArray(response.data.details)) {
      return response.data.details
    }

    // Jika format tidak dikenal, kembalikan array kosong untuk mencegah crash
    console.error('Unexpected response format for stock details:', response.data)
    return []
    // --- AKHIR FIX ---
  } catch (error) {
    console.error('Error fetching product stock details:', error)
    // Re-throwing the error
    throw new Error(error.response?.data?.message || 'Gagal mengambil detail stok')
  }
}
