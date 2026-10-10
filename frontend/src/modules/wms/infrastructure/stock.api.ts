import { http } from '@/core/infrastructure/http.client'
import axios from '@/core/infrastructure/http.client' // Untuk fungsi legacy yg mengandalkan res.data
import type { ApiResponse, PaginatedData } from '@/core/domain/api.types'
import type { StockFilter, ProductStock, StockLocation } from '../domain/stock.entity'

/**
 * Repository untuk API Stok (WMS)
 * Mengenkapsulasi panggilan HTTP ke backend.
 */
export const stockApi = {
  async fetchProductsStock(filter: StockFilter): Promise<{ data: ProductStock[]; meta: any }> {
    const params: Record<string, any> = {
      page: filter.page || 1,
      limit: filter.limit || 30,
      search: filter.search || '',
      searchBy: filter.searchBy || 'name'
    }

    const response = await http.get('/wms/stock', { params })
    return response.data
  },

  async exportStock(filter: StockFilter): Promise<Blob> {
    const response = await http.get('/wms/stock/export', {
      params: filter,
      responseType: 'blob'
    })
    return response.data
  },

  transferStock(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/transfer', payload)
  },

  adjustStock(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/adjust', payload)
  },

  async fetchAllLocations(): Promise<StockLocation[]> {
    try {
      const response = await axios.get('/locations')
      if (Array.isArray(response.data)) {
        return response.data
      }
      if (response.data && Array.isArray(response.data.data)) {
        return response.data.data
      }
      console.error('Unexpected response format for all locations:', response.data)
      return []
    } catch (error: any) {
      console.error('Error fetching all locations:', error)
      throw new Error(error.response?.data?.message || 'Gagal mengambil daftar lokasi')
    }
  },

  fetchStockHistory(productId: number, params: any): Promise<ApiResponse<PaginatedData<any>>> {
    return http.get(`/stock/history/${productId}`, { params })
  },

  async fetchBatchLogs(params: any): Promise<{ data: any[]; pagination: any }> {
    try {
      const response = await axios.get('/stock/batch-log', { params })
      return { data: response.data.data || [], pagination: response.data.pagination }
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  requestBatchLogExport(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/batch-log/export', payload)
  },

  batchTransferStock(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/batch-transfer', payload)
  },

  processBatchMovement(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/batch-process', payload)
  },

  processSingleTransfer(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/transfer', payload)
  },

  async requestAdjustmentUpload(file: File, notes?: string): Promise<ApiResponse<any>> {
    const formData = new FormData()
    formData.append('adjustmentFile', file)
    if (notes) formData.append('notes', notes)

    const response = await axios.post('/stock/request-adjustment-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return response.data
  },

  getImportJobs(): Promise<ApiResponse<any[]>> {
    return http.get(`/stock/import-jobs?t=${new Date().getTime()}`)
  },

  voidImportJob(jobId: number): Promise<ApiResponse<any>> {
    return http.post(`/stock/import-jobs/${jobId}/void`)
  },

  async fetchMovementTypes(): Promise<string[]> {
    try {
      const response = await axios.get('/stock/movement-types')
      return response.data.data || []
    } catch (error) {
      console.error('Error fetching movement types', error)
      return []
    }
  }
}
