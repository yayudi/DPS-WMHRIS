import { http } from '@/core/infrastructure/http.client'
import axios from '@/core/infrastructure/http.client'

/**
 * Repository untuk API Stock Request (WMS)
 */
export const stockRequestApi = {
  async fetchStockRequests(params: Record<string, any> = {}): Promise<any> {
    try {
      const response = await axios.get('/stock-requests', { params })
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  async createStockRequest(payload: any): Promise<any> {
    try {
      const response = await axios.post('/stock-requests', payload)
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  async approveStockRequest(id: number): Promise<any> {
    try {
      const response = await axios.post(`/stock-requests/${id}/approve`)
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  async rejectStockRequest(id: number): Promise<any> {
    try {
      const response = await axios.post(`/stock-requests/${id}/reject`)
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  async dispatchStockRequest(id: number): Promise<any> {
    try {
      const response = await axios.post(`/stock-requests/${id}/dispatch`)
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  async completeStockRequest(id: number, receivedItems: any[]): Promise<any> {
    try {
      const response = await axios.post(`/stock-requests/${id}/complete`, { receivedItems })
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  },

  async bulkActionStockRequests(action: string, requestIds: number[]): Promise<any> {
    try {
      const response = await axios.post('/stock-requests/bulk-action', { action, requestIds })
      return response.data
    } catch (error: any) {
      throw error.response?.data || error
    }
  }
}
