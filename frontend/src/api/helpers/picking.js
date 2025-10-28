import axios from '../axios'

/**
 * Mengirim file picking list ke backend untuk di-parsing dan divalidasi.
 * @param {FormData} formData - Objek FormData yang berisi file dan sumbernya.
 * @returns {Promise<object>} - Hasil validasi dari server.
 */
export async function uploadPickingList(formData) {
  try {
    const response = await axios.post('/picking/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  } catch (error) {
    console.error('Error saat upload picking list:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengonfirmasi picking list dan mengurangi stok.
 * @param {number|string} pickingListId - ID picking list.
 * @param {object} payload - Objek payload LANGSUNG DARI FRONTEND. Contoh: { items: [{ sku: 'SKU1', qty: 5 }] }
 * @returns {Promise<object>} - Respons dari backend.
 */
// --- FIX: Ubah parameter kedua dan HAPUS pembungkusan ulang ---
export const confirmPickingList = async (pickingListId, payload) => {
  try {
    // const payload = { items: itemsToProcess } // <-- HAPUS BARIS INI
    const response = await axios.post(`/picking/${pickingListId}/confirm`, payload, {
      // Kirim payload apa adanya
      headers: {
        'Content-Type': 'application/json', // Pastikan header benar
      },
    })
    return response.data
  } catch (error) {
    console.error('Error saat konfirmasi picking list:', error.response?.data || error.message)
    // Coba berikan pesan error yang lebih spesifik jika ada dari backend
    throw new Error(error.response?.data?.message || 'Gagal mengonfirmasi picking list.')
  }
}

/**
 * Mengambil riwayat semua sesi upload picking list dari server.
 * @returns {Promise<Array>} - Array berisi objek riwayat picking list.
 */
export async function fetchPickingHistory() {
  try {
    const response = await axios.get('/picking/history')
    return response.data.data || []
  } catch (error) {
    console.error(
      'Error saat mengambil riwayat picking list:',
      error.response?.data || error.message,
    )
    throw error.response?.data || error
  }
}

/**
 * Mengambil detail item dari sebuah picking list spesifik.
 * @param {number} pickingListId - ID dari picking list.
 * @returns {Promise<object>}
 */
export async function fetchPickingDetails(pickingListId) {
  try {
    const response = await axios.get(`/picking/${pickingListId}/details`)
    return response.data
  } catch (error) {
    console.error(
      `Error fetching picking details for ID ${pickingListId}:`,
      error.response?.data || error.message,
    )
    throw new Error(error.response?.data?.message || 'Gagal memuat detail picking list.')
  }
}

/**
 * Mengirim permintaan untuk membatalkan picking list yang PENDING.
 * @param {number|string} pickingListId - ID picking list.
 * @returns {Promise<object>} - Respons dari backend.
 */
export const cancelPickingList = async (pickingListId) => {
  try {
    const response = await api.post(`/picking/${pickingListId}/cancel`)
    return response.data
  } catch (error) {
    console.error('Error cancelling picking list:', error.response?.data || error.message)
    throw new Error(error.response?.data?.message || 'Gagal membatalkan picking list.')
  }
}

/**
 * Mengirim permintaan untuk membatalkan (void) sebuah picking list.
 * @param {number} pickingListId - ID dari picking list yang akan dibatalkan.
 * @returns {Promise<object>}
 */
export async function voidPickingList(pickingListId) {
  try {
    const response = await axios.post(`/picking/${pickingListId}/void`)
    return response.data
  } catch (error) {
    console.error('Error saat membatalkan picking list:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}
