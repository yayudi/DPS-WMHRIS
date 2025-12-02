// frontend\src\api\helpers\stock.js
import axios from '../axios'

/**
 * Mengirim permintaan untuk mentransfer stok antar lokasi.
 * @param {object} payload - Data transfer.
 * @param {number} payload.productId - ID produk yang akan ditransfer.
 * @param {number} payload.fromLocationId - ID lokasi asal.
 * @param {number} payload.toLocationId - ID lokasi tujuan.
 * @param {number} payload.quantity - Jumlah yang akan ditransfer.
 * @returns {Promise<object>} - Respons dari API.
 */
export async function transferStock(payload) {
  try {
    const response = await axios.post('/stock/transfer', payload)
    return response.data
  } catch (error) {
    console.error('Error saat transfer stok:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengirim permintaan untuk menyesuaikan stok di satu lokasi.
 * @param {object} payload - Data penyesuaian.
 * @returns {Promise<object>} - Respons dari API.
 */
export async function adjustStock(payload) {
  try {
    const response = await axios.post('/stock/adjust', payload)
    return response.data
  } catch (error) {
    console.error('Error saat penyesuaian stok:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil semua lokasi
 * @returns {Promise<Array<{id: number, code: string}>>}
 */
export const fetchAllLocations = async () => {
  try {
    const response = await axios.get('/locations') // Menggunakan path relatif

    // FIX: Pastikan kita selalu mengembalikan array
    if (Array.isArray(response.data)) {
      return response.data
    }
    // Cek jika dibungkus dalam properti 'data'
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data
    }
    // Fallback jika format tidak dikenal
    console.error('Unexpected response format for all locations:', response.data)
    return [] // Kembalikan array kosong untuk mencegah crash
  } catch (error) {
    console.error('Error fetching all locations:', error)
    throw new Error(error.response?.data?.message || 'Gagal mengambil daftar lokasi')
  }
}

/**
 * Mengambil riwayat pergerakan stok untuk produk tertentu.
 * @param {number} productId - ID produk.
 * @param {number} page - Nomor halaman yang diminta.
 * @returns {Promise<object>} - Objek berisi data riwayat dan informasi paginasi.
 */
export async function fetchStockHistory(productId, page = 1) {
  try {
    const response = await axios.get(`/stock/history/${productId}`, {
      params: { page },
    })
    return response.data
  } catch (error) {
    console.error(
      `Error saat mengambil riwayat stok untuk produk ${productId}:`,
      error.response?.data || error.message,
    )
    throw error.response?.data || error
  }
}

/**
 * Mengambil semua log pergerakan stok dalam rentang tanggal tertentu.
 * @param {string} startDate - Tanggal mulai (YYYY-MM-DD).
 * @param {string} endDate - Tanggal selesai (YYYY-MM-DD).
 * @returns {Promise<Array>} - Array berisi objek log pergerakan.
 */
export async function fetchBatchLogs(startDate, endDate) {
  try {
    const response = await axios.get('/stock/batch-log', {
      params: { startDate, endDate },
    })
    return response.data.data || []
  } catch (error) {
    console.error(`Error saat mengambil log batch:`, error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * --- FUNGSI BARU ---
 * Mengirim permintaan untuk mentransfer beberapa produk sekaligus.
 * @param {object} payload - Data transfer batch.
 * @param {number} payload.fromLocationId - ID lokasi asal.
 * @param {number} payload.toLocationId - ID lokasi tujuan.
 * @param {Array<{sku: string, quantity: number}>} payload.movements - Array item yang akan dipindahkan.
 * @returns {Promise<object>} - Respons dari API.
 */
export async function batchTransferStock(payload) {
  try {
    const response = await axios.post('/stock/batch-transfer', payload)
    return response.data
  } catch (error) {
    console.error('Error saat batch transfer stok:', error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Memproses batch movement (API universal)
 * @param {object} payload - { type, fromLocationId?, toLocationId?, notes?, movements: [...] }
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const processBatchMovement = async (payload) => {
  try {
    // API ini harus bisa menangani payload 'TRANSFER'
    // baik dengan from/to di root, atau from/to di dalam array movements
    const response = await axios.post('/stock/batch-process', payload) // Menggunakan path relatif
    return response.data
  } catch (error) {
    console.error('Error processing batch movement:', error)
    throw new Error(error.response?.data?.message || 'Gagal memproses batch')
  }
}

/**
 * Memproses transfer stok untuk satu item (Detailed Transfer).
 * @param {object} payload - { sku, fromLocationId, toLocationId, quantity, notes }
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const processSingleTransfer = async (payload) => {
  try {
    const response = await axios.post('/stock/transfer', payload) // Menggunakan path relatif
    return response.data
  } catch (error) {
    console.error('Error processing single transfer:', error)
    throw new Error(error.response?.data?.message || 'Gagal memproses transfer')
  }
}

/**
 * Mengirim file CSV penyesuaian stok.
 * Menggunakan FormData untuk mengirim file.
 * @param {File} file - File .csv yang dipilih pengguna
 * @returns {Promise<object>} Objek respons dari API
 */
export const requestAdjustmentUpload = async (file) => {
  const formData = new FormData()
  // 'adjustmentFile' HARUS cocok dengan nama field di upload.single() di backend
  formData.append('adjustmentFile', file)

  try {
    const response = await axios.post('/stock/request-adjustment-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data // Mengembalikan { success: true, message: "...", jobId: ... }
  } catch (error) {
    console.error('Error uploading stock adjustment file:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengambil riwayat pekerjaan impor untuk pengguna saat ini.
 * @returns {Promise<object>} Objek respons dari API
 */
export const getImportJobs = async () => {
  try {
    const response = await axios.get(`/stock/import-jobs?t=${new Date().getTime()}`)
    return response.data // Mengembalikan { success: true, data: [...] }
  } catch (error) {
    console.error('Error fetching user import jobs:', error)
    throw error.response?.data || error
  }
}

export async function cancelImportJob(jobId) {
  try {
    const response = await axios.post(`/stock/import-jobs/${jobId}/cancel`)
    return response.data
  } catch (error) {
    console.error('Error cancelling import job:', error)
    throw error.response?.data || error
  }
}

/**
 * [FASE 5b] Memvalidasi item retur dan mengembalikan stok ke lokasi spesifik.
 * @param {object} payload
 * @param {number} payload.pickingListItemId - ID dari item di picking_list_items
 * @param {number} payload.returnToLocationId - ID lokasi tujuan pengembalian stok
 * @returns {Promise<object>}
 */
export async function validateStockReturn(payload) {
  try {
    const response = await axios.post('/stock/validate-return', payload)
    return response.data
  } catch (error) {
    console.error('Error validating return:', error)
    throw error.response?.data || error
  }
}
