// frontend\src\api\helpers\fulfilment.js
import api from '@/api/axios.js'

/**
 * Validasi & Upload Batch (CSV/JSON)
 * Digunakan oleh FulfilmentUploadForm.vue untuk alur "Tagihan (CSV)"
 * Payload diharapkan: { items: [...], source: 'Tagihan (CSV)', filename: '...' }
 */
export const uploadBatchFulfilmentListJson = async payload => {
  // Kita menggunakan endpoint yang sama dengan validasi PDF karena logikanya sama (Batch Upload)
  const response = await api.post('/fulfilment/batch-upload', payload)
  return response.data
}

/**
 * Validasi Data Parsed (PDF)
 * Digunakan oleh FulfilmentUploadForm.vue untuk alur "Tokopedia/Shopee (PDF)"
 * Payload diharapkan: { items: [...], source: 'Tokopedia', filename: '...' }
 */
export const validateParsedFulfilmentList = async payload => {
  const response = await api.post('/fulfilment/batch-upload', payload)
  return response.data
}

/**
 * Mengambil Detail Item per Fulfilment
 * Digunakan oleh FulfilmentListDetailsModal.vue
 */
export const fetchFulfilmentDetails = async fulfilmentListId => {
  try {
    const response = await api.get(`/fulfilment/${fulfilmentListId}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching details for list #${fulfilmentListId}:`, error)
    throw error.response?.data || error
  }
}

export const getPendingFilterOptions = async () => {
  try {
    const response = await api.get('/fulfilment/pending-filter-options')
    return response.data.data
  } catch (error) {
    console.error('Error fetching filter options:', error)
    throw error.response?.data || error
  }
}

/**
 * Data ini berasal dari tabel 'fulfilment_list_items' dengan status 'PENDING'.
 * @param {Object} params Filter parameters
 * @returns {Promise<Object>} Object with items, total, page, limit
 */
export const getPendingFulfilmentItems = async (params = {}) => {
  try {
    const response = await api.get('/fulfilment/pending-items', { params })
    return response.data.data
  } catch (error) {
    console.error('Error fetching pending fulfilment items:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengambil riwayat item yang SUDAH selesai atau diretur
 * Digunakan untuk tab "Riwayat Fulfilment"
 */
export const getHistoryFulfilmentItems = async () => {
  const response = await api.get('/fulfilment/history-items')
  return response.data.data
}

/**
 * Menyelesaikan proses picking (Mengurangi stok fisik)
 * @param {Array<number>} payload - Array ID dari fulfilment_list_items yang dicentang
 * @returns {Promise<Object>} Response sukses
 */
export const completeFulfilmentItems = async payload => {
  try {
    const response = await api.post('/fulfilment/complete-items', payload)
    return response.data
  } catch (error) {
    console.error('Error completing fulfilment items:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengambil khusus item yang statusnya RETURNED
 * Digunakan untuk validasi retur (jika diperlukan terpisah)
 * @returns {Promise<Array>} Array of item objects (retur)
 */
export const getReturnedItems = async () => {
  try {
    const response = await api.get('/fulfilment/returned-items')
    return response.data.data // Mengembalikan array item
  } catch (error) {
    console.error('Error fetching returned items:', error)
    throw error.response?.data || error
  }
}

/**
 * Membatalkan fulfilment list yang masih PENDING
 * Digunakan jika user perlu membatalkan fulfilment list (misal: salah upload SKU)
 * @param {number} fulfilmentListId - ID dari fulfilment list yang akan dibatalkan
 * @returns {Promise<Object>} Response sukses
 */
export const voidFulfilmentList = async fulfilmentListId => {
  try {
    const response = await api.post(`/fulfilment/void/${fulfilmentListId}`)
    return response.data
  } catch (error) {
    console.error('Error voiding fulfilment list:', error)
    throw error.response?.data || error
  }
}

/**
 * Mencari ulang stok untuk item yang BACKORDER dalam sebuah Fulfilment (Targeted Refresh)
 * @param {number} fulfilmentListId
 */
export const retryBackorders = async fulfilmentListId => {
  try {
    const response = await api.post(`/fulfilment/${fulfilmentListId}/retry-backorders`)
    return response.data
  } catch (error) {
    console.error('Error retrying backorders:', error)
    throw error.response?.data || error
  }
}

/**
 * Mencari ulang stok untuk item yang BACKORDER dalam beberapa Fulfilment sekaligus (Targeted Refresh Batch)
 * @param {Array<number>} fulfilmentListIds
 */
export const retryBackordersBatch = async fulfilmentListIds => {
  try {
    const response = await api.post(`/fulfilment/retry-backorders-batch`, { fulfilmentListIds })
    return response.data
  } catch (error) {
    console.error('Error retrying backorders batch:', error)
    throw error.response?.data || error
  }
}

/**
 * Memicu sinkronisasi dari Kelja ERP.
 * Endpoint ini mengembalikan Job ID untuk di-poll.
 * @returns {Promise<Object>} Response sukses berisi Job ID
 */
export const syncKeljaFulfillment = async () => {
  try {
    const response = await api.post('/fulfilment/sync-kelja')
    return response.data
  } catch (error) {
    console.error('Error syncing Kelja ERP:', error)
    throw error.response?.data || error
  }
}
