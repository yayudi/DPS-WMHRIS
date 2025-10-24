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
 * Mengonfirmasi picking list yang sudah divalidasi untuk mengurangi stok.
 * @param {number} pickingListId - ID dari picking list yang akan dikonfirmasi.
 * @returns {Promise<object>} - Respons sukses dari server.
 */
export async function confirmPickingList(pickingListId, itemsToProcess) {
  try {
    const payload = { items: itemsToProcess }
    // --- PERBAIKAN: Secara eksplisit atur Content-Type header ---
    const response = await axios.post(`/picking/${pickingListId}/confirm`, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return response.data
  } catch (error) {
    console.error('Error saat konfirmasi picking list:', error.response?.data || error.message)
    throw error.response?.data || error
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
export async function fetchPickingListDetails(pickingListId) {
  try {
    const response = await axios.get(`/picking/${pickingListId}/details`)
    return response.data
  } catch (error) {
    console.error(
      'Error saat mengambil detail picking list:',
      error.response?.data || error.message,
    )
    throw error.response?.data || error
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
