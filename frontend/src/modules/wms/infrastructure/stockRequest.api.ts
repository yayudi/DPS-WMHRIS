import { http } from '@/core/infrastructure/http.client'

/**
 * Repository untuk API Stock Request (WMS)
 */
export const stockRequestApi = {
  async fetchStockRequests(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await http.get('/stock-requests', { params })
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  createStockRequest(payload: any): Promise<any> {
    return http.post('/stock-requests', payload)
  },

  approveStockRequest(id: number): Promise<any> {
    return http.post(`/stock-requests/${id}/approve`)
  },

  rejectStockRequest(id: number): Promise<any> {
    return http.post(`/stock-requests/${id}/reject`)
  },

  dispatchStockRequest(id: number): Promise<any> {
    return http.post(`/stock-requests/${id}/dispatch`)
  },

  completeStockRequest(id: number, receivedItems: any[]): Promise<any> {
    return http.post(`/stock-requests/${id}/complete`, { receivedItems })
  },

  async bulkActionStockRequests(action: string, requestIds: number[]): Promise<any> {
    try {
      const response = await http.post('/stock-requests/bulk-action', { action, requestIds })
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  }
}
