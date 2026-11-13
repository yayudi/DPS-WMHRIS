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
    return http.post('/locations', payload)
  },

  /**
   * Mengedit lokasi yang sudah ada.
   */
  async updateLocation(id: number | string, payload: UpdateLocationPayload): Promise<any> {
    return http.put(`/locations/${id}`, payload)
  },

  /**
   * Menghapus sebuah lokasi.
   */
  async deleteLocation(id: number | string): Promise<any> {
    return http.delete(`/locations/${id}`)
  },

  /**
   * Mengubah status sumber fulfillment untuk lokasi.
   */
  async toggleFulfillmentSource(id: number | string, isFulfillmentSource: boolean): Promise<any> {
    return http.put(`/locations/${id}/fulfillment-source`, {
      is_fulfillment_source: isFulfillmentSource
    })
  }
}
