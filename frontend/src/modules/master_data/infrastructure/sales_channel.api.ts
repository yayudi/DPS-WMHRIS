import { http } from '@/core/infrastructure/http.client'

export const salesChannelApi = {
  async fetchAllSalesChannels(): Promise<any> {
    const response = await http.get('/sales-channels')
    return response.data || []
  },
  async createSalesChannel(payload: any): Promise<any> {
    const response = await http.post('/sales-channels', payload)
    return response.data
  },
  async updateSalesChannel(id: number | string, payload: any): Promise<any> {
    const response = await http.put(`/sales-channels/${id}`, payload)
    return response.data
  },
  async deleteSalesChannel(id: number | string): Promise<any> {
    const response = await http.delete(`/sales-channels/${id}`)
    return response.data
  }
}
