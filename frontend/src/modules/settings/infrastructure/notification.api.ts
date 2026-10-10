import axios from '@/core/infrastructure/http.client'

export const notificationApi = {
  async getNotifications(page = 1, limit = 20, status = 'all'): Promise<any> {
    const { data } = await axios.get('/notifications', { params: { page, limit, status } })
    return data
  },
  
  async markAllAsDone(): Promise<void> {
    await axios.put('/notifications/all/done')
  },

  async markAsDone(id: number | string): Promise<void> {
    await axios.put(`/notifications/${id}/done`)
  },

  async claimNotification(id: number | string): Promise<any> {
    const { data } = await axios.put(`/notifications/${id}/claim`)
    return data
  },

  async getPreferences(): Promise<any> {
    const { data } = await axios.get('/notifications/preferences')
    return data.data
  },

  async updatePreferences(preferences: Record<string, boolean>): Promise<any> {
    const { data } = await axios.put('/notifications/preferences', { preferences })
    return data
  }
}
