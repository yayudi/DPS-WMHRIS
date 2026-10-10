import { http } from '@/core/infrastructure/http.client'
import type { ApiResponse } from '@/core/domain/api.types'
import type { CreateUserPayload, UpdateUserPayload } from '../domain/user.entity'

export const userApi = {
  /**
   * Mengambil daftar semua pengguna
   */
  fetchAllUsers(): Promise<any> {
    return http.get('/admin/users')
  },

  /**
   * Membuat pengguna baru
   */
  createUser(payload: CreateUserPayload): Promise<any> {
    return http.post('/admin/users', payload)
  },

  /**
   * Memperbarui pengguna
   */
  updateUser(id: number, payload: UpdateUserPayload): Promise<any> {
    return http.put(`/admin/users/${id}`, payload)
  },

  /**
   * Menghapus pengguna
   */
  deleteUser(id: number): Promise<any> {
    return http.delete(`/admin/users/${id}`)
  },

  /**
   * Mendapatkan lokasi yang diizinkan untuk pengguna
   */
  fetchUserLocationIds(id: number): Promise<any> {
    return http.get(`/admin/users/${id}/locations`)
  },

  /**
   * Memperbarui lokasi yang diizinkan untuk pengguna
   */
  updateUserLocations(id: number, locationIds: number[]): Promise<any> {
    return http.put(`/admin/users/${id}/locations`, { locationIds })
  }
}
