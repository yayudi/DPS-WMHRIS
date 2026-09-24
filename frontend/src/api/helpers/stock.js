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
 * @param {string} movementType - Tipe pergerakan stok (opsional).
 * @param {string} startDate - Tanggal mulai (opsional).
 * @param {string} endDate - Tanggal akhir (opsional).
 * @param {string|number} locationId - ID Lokasi (opsional).
 * @param {string} user - Nama pengguna (opsional).
 * @returns {Promise<object>} - Objek berisi data riwayat dan informasi paginasi.
 */
export async function fetchStockHistory(
  productId,
  page = 1,
  movementType = 'all',
  startDate = '',
  endDate = '',
  locationId = 'all',
  user = ''
) {
  try {
    const params = { page }
    if (movementType && movementType !== 'all') {
      params.movementType = movementType
    }
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    if (locationId && locationId !== 'all') params.locationId = locationId
    if (user) params.user = user

    const response = await axios.get(`/stock/history/${productId}`, { params })
    return response.data
  } catch (error) {
    console.error(`Error saat mengambil riwayat stok untuk produk ${productId}:`, error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Mengambil semua log pergerakan stok dengan filter.
 * @param {object} params - { startDate, endDate, productName, movementType, locationId, user, page, limit }
 * @returns {Promise<object>} - Objek berisi data array dan pagination object.
 */
export async function fetchBatchLogs(startDate, endDate, filters = {}, page = 1, limit = 50) {
  try {
    const { productName, movementType, sourceLocation, destinationLocation, user: userId, notes } = filters
    const params = {
      startDate,
      endDate,
      page,
      limit
    }

    // Hanya kirim jika nilainya truthy (bukan null, undefined, atau string kosong)
    if (productName) params.productName = productName
    if (movementType) params.movementType = movementType
    if (sourceLocation) params.sourceLocation = sourceLocation
    if (destinationLocation) params.destinationLocation = destinationLocation
    if (userId) params.userId = userId
    if (notes) params.notes = notes

    const response = await axios.get('/stock/batch-log', {
      params
    })
    return { data: response.data.data || [], pagination: response.data.pagination }
  } catch (error) {
    console.error(`Error saat mengambil log batch:`, error.response?.data || error.message)
    throw error.response?.data || error
  }
}

/**
 * Meminta export batch log (Background Job).
 * @param {string} startDate
 * @param {string} endDate
 * @param {object} filters
 * @returns {Promise<object>}
 */
export async function requestBatchLogExport(startDate, endDate, filters = {}) {
  try {
    const payload = {
      startDate,
      endDate,
      ...filters
    }

    // Hapus null/undefined fields
    Object.keys(payload).forEach(key => {
      if (payload[key] == null || payload[key] === '') {
        delete payload[key]
      }
    })

    const response = await axios.post('/stock/batch-log/export', payload)
    return response.data
  } catch (error) {
    console.error(`Error saat request export batch log:`, error.response?.data || error.message)
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
export const processBatchMovement = async payload => {
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
export const processSingleTransfer = async payload => {
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
export const requestAdjustmentUpload = async (file, notes) => {
  const formData = new FormData()
  // 'adjustmentFile' HARUS cocok dengan nama field di upload.single() di backend
  formData.append('adjustmentFile', file)
  if (notes) {
    formData.append('notes', notes)
  }

  try {
    const response = await axios.post('/stock/request-adjustment-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
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

export async function voidImportJob(jobId) {
  try {
    const response = await axios.post(`/stock/import-jobs/${jobId}/void`)
    return response.data
  } catch (error) {
    console.error('Error voiding import job:', error)
    throw error.response?.data || error
  }
}

/**
 * [FASE 5b] Memvalidasi item retur dan mengembalikan stok ke lokasi spesifik.
 * @param {object} payload
 * @param {number} payload.fulfilmentListItemId - ID dari item di fulfilment_list_items
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

/**
 * Mengambil daftar unik movement type
 * @returns {Promise<Array>} Array of string movement types
 */
export const fetchMovementTypes = async () => {
  try {
    const response = await axios.get('/stock/movement-types')
    return response.data.data || []
  } catch (error) {
    console.error('Error saat mengambil movement types:', error.response?.data || error.message)
    return []
  }
}
