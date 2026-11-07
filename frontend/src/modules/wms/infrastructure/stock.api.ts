import { http } from '@/core/infrastructure/http.client'
import type { ApiResponse, PaginatedData } from '@/core/domain/api.types'
import type { StockFilter, ProductStock, StockLocation } from '../domain/stock.entity'
import { locationApi } from '@/modules/master_data/infrastructure/location.api'

export interface TransferStockPayload {
  product_id?: number
  from_location_id?: number
  to_location_id?: number
  quantity: number
  notes?: string
  [key: string]: unknown
}

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

  exportStock(filter: StockFilter): Promise<Blob> {
    return http.blob('/wms/stock/export', { params: filter })
  },

  transferStock(payload: TransferStockPayload): Promise<ApiResponse<any>> {
    return http.post('/stock/transfer', payload)
  },

  adjustStock(payload: any): Promise<ApiResponse<any>> {
    return http.post('/stock/adjust', payload)
  },

  async fetchAllLocations(): Promise<StockLocation[]> {
    return locationApi.fetchAllLocations()
  },

  fetchStockHistory(productId: number, params: any): Promise<ApiResponse<PaginatedData<any>>> {
    return http.get(`/stock/history/${productId}`, { params })
  },

  async fetchBatchLogs(params: any): Promise<{ data: any[]; pagination: any }> {
    const response = await http.get<any>('/stock/batch-log', { params })
    return { data: response.data || [], pagination: (response as any).pagination }
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

  processSingleTransfer(payload: TransferStockPayload): Promise<ApiResponse<any>> {
    return this.transferStock(payload)
  },

  requestAdjustmentUpload(file: File, notes?: string, dryRun = false): Promise<ApiResponse<any>> {
    const formData = new FormData()
    formData.append('adjustmentFile', file)
    if (notes) formData.append('notes', notes)
    if (dryRun) formData.append('dryRun', 'true')

    return http.upload('/stock/request-adjustment-upload', formData)
  },

  getImportJobs(): Promise<ApiResponse<any[]>> {
    return http.get(`/stock/import-jobs?t=${new Date().getTime()}`)
  },

  voidImportJob(jobId: number): Promise<ApiResponse<any>> {
    return http.post(`/stock/import-jobs/${jobId}/void`)
  },

  async fetchMovementTypes(): Promise<string[]> {
    try {
      const response = await http.get<string[]>('/stock/movement-types')
      return response.data || []
    } catch (error) {
      console.error('Error fetching movement types', error)
      return []
    }
  }
}
