import { http } from '@/core/infrastructure/http.client'
import type { CreateLocationPayload, UpdateLocationPayload } from '../domain/location.entity'

export const locationApi = {
  /**
   * Mengambil semua lokasi dari server.
   */
  async fetchAllLocations(): Promise<any> {
    const response = await http.get('/locations')
    return response.data || []
  },

  /**
   * Membuat lokasi baru.
   */
  async createLocation(payload: CreateLocationPayload): Promise<any> {
    const response = await http.post('/locations', payload)
    return response.data
  },

  /**
   * Mengedit lokasi yang sudah ada.
   */
  async updateLocation(id: number | string, payload: UpdateLocationPayload): Promise<any> {
    const response = await http.put(`/locations/${id}`, payload)
    return response.data
  },

  /**
   * Menghapus sebuah lokasi.
   */
  async deleteLocation(id: number | string): Promise<any> {
    const response = await http.delete(`/locations/${id}`)
    return response.data
  }
}
