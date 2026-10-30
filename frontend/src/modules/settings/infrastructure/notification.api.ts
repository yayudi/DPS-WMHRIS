import { http } from '@/core/infrastructure/http.client'

export const notificationApi = {
  async getNotifications(page = 1, limit = 20, status = 'all'): Promise<any> {
    const response = await http.get('/notifications', { params: { page, limit, status } })
    return response.data
  },

  async getRecentNotifications(limit = 5): Promise<any> {
    const response = await http.get('/notifications/recent', { params: { limit } })
    return response.data
  },
  
  async markAllAsDone(): Promise<void> {
    await http.put('/notifications/all/done')
  },

  async markAsDone(id: number | string): Promise<void> {
    await http.put(`/notifications/${id}/done`)
  },

  async claimNotification(id: number | string): Promise<any> {
    const response = await http.put(`/notifications/${id}/claim`)
    return response.data
  },

  async getPreferences(): Promise<any> {
    const response = await http.get('/notifications/preferences')
    return response.data
  },

  async updatePreferences(preferences: Record<string, boolean>): Promise<any> {
    const response = await http.put('/notifications/preferences', { preferences })
    return response.data
  }
}
