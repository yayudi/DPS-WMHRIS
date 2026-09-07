// frontend\src\api\helpers\picking.js
import api from '@/api/axios.js'

/**
 * Validasi & Upload Batch (CSV/JSON)
 * Digunakan oleh PickingUploadForm.vue untuk alur "Tagihan (CSV)"
 * Payload diharapkan: { items: [...], source: 'Tagihan (CSV)', filename: '...' }
 */
export const uploadBatchPickingListJson = async payload => {
  // Kita menggunakan endpoint yang sama dengan validasi PDF karena logikanya sama (Batch Upload)
  const response = await api.post('/picking/batch-upload', payload)
  return response.data
}

/**
 * Validasi Data Parsed (PDF)
 * Digunakan oleh PickingUploadForm.vue untuk alur "Tokopedia/Shopee (PDF)"
 * Payload diharapkan: { items: [...], source: 'Tokopedia', filename: '...' }
 */
export const validateParsedPickingList = async payload => {
  const response = await api.post('/picking/batch-upload', payload)
  return response.data
}

/**
 * Mengambil Detail Item per Picking List
 * Digunakan oleh PickingListDetailsModal.vue
 */
export const fetchPickingDetails = async pickingListId => {
  try {
    const response = await api.get(`/picking/${pickingListId}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching details for list #${pickingListId}:`, error)
    throw error.response?.data || error
  }
}

/**
 * Data ini berasal dari tabel 'picking_list_items' dengan status 'PENDING'.
 * @returns {Promise<Array>} Array of item objects
 */
export const getPendingPickingItems = async () => {
  try {
    const response = await api.get('/picking/pending-items')
    return response.data.data // Mengembalikan array item
  } catch (error) {
    console.error('Error fetching pending picking items:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengambil riwayat item yang SUDAH selesai atau diretur
 * Digunakan untuk tab "Riwayat Picking"
 */
export const getHistoryPickingItems = async () => {
  const response = await api.get('/picking/history-items')
  return response.data.data
}

/**
 * Menyelesaikan proses picking (Mengurangi stok fisik)
 * @param {Array<number>} payload - Array ID dari picking_list_items yang dicentang
 * @returns {Promise<Object>} Response sukses
 */
export const completePickingItems = async payload => {
  try {
    const response = await api.post('/picking/complete-items', payload)
    return response.data
  } catch (error) {
    console.error('Error completing picking items:', error)
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
    const response = await api.get('/picking/returned-items')
    return response.data.data // Mengembalikan array item
  } catch (error) {
    console.error('Error fetching returned items:', error)
    throw error.response?.data || error
  }
}

/**
 * Membatalkan picking list yang masih PENDING
 * Digunakan jika user perlu membatalkan picking list (misal: salah upload SKU)
 * @param {number} pickingListId - ID dari picking list yang akan dibatalkan
 * @returns {Promise<Object>} Response sukses
 */
export const voidPickingList = async pickingListId => {
  try {
    const response = await api.post(`/picking/void/${pickingListId}`)
    return response.data
  } catch (error) {
    console.error('Error voiding picking list:', error)
    throw error.response?.data || error
  }
}

/**
 * Mencari ulang stok untuk item yang BACKORDER dalam sebuah Picking List (Targeted Refresh)
 * @param {number} pickingListId
 */
export const retryBackorders = async pickingListId => {
  try {
    const response = await api.post(`/picking/${pickingListId}/retry-backorders`)
    return response.data
  } catch (error) {
    console.error('Error retrying backorders:', error)
    throw error.response?.data || error
  }
}

/**
 * Mencari ulang stok untuk item yang BACKORDER dalam beberapa Picking List sekaligus (Targeted Refresh Batch)
 * @param {Array<number>} pickingListIds
 */
export const retryBackordersBatch = async pickingListIds => {
  try {
    const response = await api.post(`/picking/retry-backorders-batch`, { pickingListIds })
    return response.data
  } catch (error) {
    console.error('Error retrying backorders batch:', error)
    throw error.response?.data || error
  }
}
