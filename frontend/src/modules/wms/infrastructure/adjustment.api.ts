import { http } from '@/core/infrastructure/http.client'
import type { Adjustment } from '../domain/adjustment.entity'

export const adjustmentApi = {
  async fetchAdjustments(params: Record<string, any>): Promise<any> {
    const response = await http.get('/wms/adjustments', { params })
    return response.data
  },

  async createAdjustment(payload: Adjustment): Promise<any> {
    const response = await http.post('/wms/adjustments', payload)
    return response.data
  },

  async batchAdjust(payload: { items: any[], notes?: string }): Promise<any> {
    const response = await http.post('/wms/adjustments/batch', payload)
    return response.data
  }
}
