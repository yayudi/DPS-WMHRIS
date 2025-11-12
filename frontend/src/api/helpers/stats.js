// frontend/src/api/helpers/stats.js
import api from '../axios'

/**
 * Mengambil data KPI Ringkasan dari backend.
 */
export const fetchKpiSummary = async () => {
  try {
    const response = await api.get('/stats/kpi-summary')
    if (response.data && response.data.success) {
      return response.data.data // Mengembalikan objek data KPI
    } else {
      throw new Error(response.data.message || 'Gagal mengambil data KPI dari API.')
    }
  } catch (error) {
    console.error('Error fetching KPI summary:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengirim permintaan (request) untuk membuat laporan stok.
 * Ini memicu pekerjaan di backend, bukan mengunduh file secara langsung.
 * @param {object} filters - Objek berisi semua filter yang dipilih
 * @returns {Promise<object>} Objek respons dari API (misal: { message: "..." })
 */
export const requestExportStock = async (filters = {}) => {
  try {
    // Kirim filter sebagai body dari request POST
    const response = await api.post('/reports/request-export-stock', filters)

    // API akan merespons dengan JSON, bukan blob
    return response.data
  } catch (error) {
    console.error('Error requesting stock report:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengambil riwayat pekerjaan ekspor untuk pengguna saat ini.
 * @returns {Promise<object>} Objek respons dari API (misal: { success: true, data: [...] })
 */
export const getUserExportJobs = async () => {
  try {
    const response = await api.get('/reports/my-jobs')
    return response.data // Mengembalikan { success: true, data: [...] }
  } catch (error) {
    console.error('Error fetching user export jobs:', error)
    throw error.response?.data || error
  }
}

/**
 * Mengambil data filter (seperti daftar gedung) dari backend.
 */
export const fetchReportFilters = async () => {
  try {
    const response = await api.get('/reports/filters')
    if (response.data && response.data.success) {
      return response.data.data // Mengembalikan { buildings: [...], purposes: [...] }
    } else {
      throw new Error(response.data.message || 'Gagal mengambil data filter dari API.')
    }
  } catch (error) {
    console.error('Error fetching report filters:', error)
    // Lempar error agar komponen bisa menanganinya
    throw error.response?.data || error
  }
}
