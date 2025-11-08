// frontend/src/api/helpers/picking.js
import api from '../axios'

/**
 * Mengirim file picking list ke backend untuk di-parsing dan divalidasi.
 * @param {FormData} formData - Objek FormData yang berisi file dan sumbernya.
 * @returns {Promise<object>} - Hasil validasi dari server.
 */
export async function uploadPickingList(formData) {
  try {
    const response = await api.post('/picking/upload', formData, {
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
 * [BARU - HYBRID] Mengirim data picking list batch (dari CSV) yang sudah di-parse oleh frontend.
 * Ini adalah implementasi arsitektur hybrid untuk shared hosting.
 * @param {Array<object>} groupedInvoices - Array invoice dari (pickingListParser.js)
 * @returns {Promise<object>} - Respons dari backend (created, skipped)
 */
export async function uploadBatchPickingListJson(groupedInvoices) {
  try {
    // Kirim payload JSON ke endpoint backend BARU
    // Endpoint ini HANYA menangani transaksi DB, bukan parsing file
    const response = await api.post('/picking-lists/upload-json', {
      invoices: groupedInvoices,
    })
    return response.data // Misal: { success: true, message: "...", created: 5, skipped: 2 }
  } catch (error) {
    console.error('Error saat upload JSON batch picking list:', error)
    throw error.response?.data || { success: false, message: 'Error tidak diketahui dari server.' }
  }
}

/**
 * Mengirim hasil parsing client-side ke backend untuk divalidasi dan disimpan.
 * @param {object} payload - Objek berisi { source: string, items: Array<{sku: string, qty: number}> }.
 * @returns {Promise<object>} - Hasil validasi dari server (termasuk pickingListId).
 */
export const validateParsedPickingList = async (payload) => {
  try {
    // Panggil endpoint backend BARU (misal /validate-parsed)
    const response = await api.post('/picking/validate-parsed', payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    })
    // Asumsi backend mengembalikan { success: true, data: { pickingListId, validItems, invalidSkus } }
    return response.data
  } catch (error) {
    console.error(
      'Error saat validasi picking list (parsed):',
      error.response?.data || error.message,
    )
    throw new Error(error.response?.data?.message || 'Gagal mengirim data parsing ke server.')
  }
}

/**
 * Mengonfirmasi picking list dan mengurangi stok.
 * @param {number|string} pickingListId - ID picking list.
 * @param {object} payload - Objek payload LANGSUNG DARI FRONTEND. Contoh: { items: [{ sku: 'SKU1', qty: 5 }] }
 * @returns {Promise<object>} - Respons dari backend.
 */
export const confirmPickingList = async (pickingListId, payload) => {
  try {
    // const payload = { items: itemsToProcess } // <-- HAPUS BARIS INI
    const response = await api.post(`/picking/${pickingListId}/confirm`, payload, {
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
    const response = await api.get('/picking/history')
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
    const response = await api.get(`/picking/${pickingListId}/details`)
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
    const response = await api.post(`/picking/${pickingListId}/void`)
    return response.data
  } catch (error) {
    console.error('Error saat membatalkan picking list:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}
