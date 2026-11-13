import { http } from '@/core/infrastructure/http.client'

export const salesChannelApi = {
  async fetchAllSalesChannels(activeOnly = false): Promise<any> {
    const params = activeOnly ? { activeOnly: true } : undefined
    const response = await http.get('/sales-channels', { params })
    return response.data || []
  },
  createSalesChannel(payload: any): Promise<any> {
    return http.post('/sales-channels', payload)
  },
  updateSalesChannel(id: number | string, payload: any): Promise<any> {
    return http.put(`/sales-channels/${id}`, payload)
  },
  deleteSalesChannel(id: number | string): Promise<any> {
    return http.delete(`/sales-channels/${id}`)
  }
}
