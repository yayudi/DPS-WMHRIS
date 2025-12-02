// frontend\src\api\helpers\picking.js
import api from '@/api/axios.js'

/**
 * [LEGACY] Mengunggah laporan penjualan (Excel/CSV)
 * Digunakan untuk fallback atau fitur upload lama.
 */
export const uploadSalesReport = async (file, source, notes) => {
  const formData = new FormData()
  formData.append('salesReportFile', file)
  formData.append('source', source)
  if (notes) formData.append('notes', notes)

  const response = await api.post('/picking/upload-sales-report', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

/**
 * [NEW] Validasi & Upload Batch (CSV/JSON)
 * Digunakan oleh PickingUploadForm.vue untuk alur "Tagihan (CSV)"
 * Payload diharapkan: { items: [...], source: 'Tagihan (CSV)', filename: '...' }
 */
export const uploadBatchPickingListJson = async (payload) => {
  // Kita menggunakan endpoint yang sama dengan validasi PDF karena logikanya sama (Batch Upload)
  const response = await api.post('/picking/batch-upload', payload)
  return response.data
}

/**
 * [NEW] Validasi Data Parsed (PDF)
 * Digunakan oleh PickingUploadForm.vue untuk alur "Tokopedia/Shopee (PDF)"
 * Payload diharapkan: { items: [...], source: 'Tokopedia', filename: '...' }
 */
export const validateParsedPickingList = async (payload) => {
  const response = await api.post('/picking/batch-upload', payload)
  return response.data
}

/**
 * [NEW] Mengambil Detail Item per Picking List
 * Digunakan oleh PickingListDetailsModal.vue
 */
export const fetchPickingDetails = async (pickingListId) => {
  try {
    const response = await api.get(`/picking/${pickingListId}`)
    return response.data
  } catch (error) {
    console.error(`Error fetching details for list #${pickingListId}:`, error)
    throw error.response?.data || error
  }
}

/**
 * Data ini berasal dari tabel 'picking_list_items' dengan status 'PENDING_VALIDATION'.
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
 * @param {Array<number>} itemIds - Array ID dari picking_list_items yang dicentang
 * @returns {Promise<Object>} Response sukses
 */
export const completePickingItems = async (itemIds) => {
  try {
    const response = await api.post('/picking/complete-items', { itemIds })
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
 * Membatalkan picking list yang masih PENDING_VALIDATION
 * Digunakan jika user perlu membatalkan picking list (misal: salah upload SKU)
 * @param {number} pickingListId - ID dari picking list yang akan dibatalkan
 * @returns {Promise<Object>} Response sukses
 */
export const cancelPickingList = async (pickingListId) => {
  try {
    const response = await api.post(`/picking/cancel/${pickingListId}`)
    return response.data
  } catch (error) {
    console.error('Error cancelling picking list:', error)
    throw error.response?.data || error
  }
}
