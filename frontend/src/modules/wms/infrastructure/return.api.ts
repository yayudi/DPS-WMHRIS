import { http } from '@/core/infrastructure/http.client'
import axios from '@/core/infrastructure/http.client'
import type { ReturnData } from '../domain/return.entity'

export const returnApi = {
  async fetchReturns(params: Record<string, any>): Promise<any> {
    const response = await http.get('/wms/returns', { params })
    return response.data
  },

  async createReturn(payload: ReturnData): Promise<any> {
    const response = await http.post('/wms/returns', payload)
    return response.data
  },

  async getPendingReturns(): Promise<any> {
    const response = await axios.get('/returns/pending')
    return response.data.data
  },

  async getReturnHistory(params: Record<string, any> = {}): Promise<any> {
    const response = await axios.get('/returns/history', { params })
    return response.data.data
  },

  async approveReturn(payload: any): Promise<any> {
    const response = await axios.post('/returns/approve', payload)
    return response.data
  },

  async createManualReturn(payload: any): Promise<any> {
    const response = await axios.post('/returns/manual-entry', payload)
    return response.data
  }
}
