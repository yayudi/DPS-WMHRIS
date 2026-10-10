import { http } from '@/core/infrastructure/http.client'
import type { Media } from '../domain/media.entity'

export const mediaApi = {
  /**
   * Mengambil daftar media (dengan pagination & filter)
   */
  async getMedia(params?: Record<string, any>): Promise<any> {
    const response = await http.get('/media', { params })
    return response.data
  },

  /**
   * Mengambil detail media berdasarkan ID
   */
  async getMediaById(id: number | string): Promise<Media> {
    const response = await http.get(`/media/${id}`)
    return response.data
  },

  /**
   * Menghapus media
   */
  async deleteMedia(id: number | string): Promise<any> {
    const response = await http.delete(`/media/${id}`)
    return response.data
  },

  /**
   * Memperbarui tags dari media
   */
  async updateMediaTags(id: number | string, tags: string[]): Promise<any> {
    const response = await http.put(`/media/${id}/tags`, { tags })
    return response.data
  },

  /**
   * Memperbarui judul dari media
   */
  async updateMediaTitle(id: number | string, title: string): Promise<any> {
    const response = await http.put(`/media/${id}/title`, { title })
    return response.data
  },

  /**
   * Mendapatkan presigned URL untuk upload ke R2
   */
  async getPresignedUrl(files: any[]): Promise<any> {
    const response = await http.post('/media/presigned-url', { files })
    return response.data
  },

  /**
   * Konfirmasi ke backend bahwa upload selesai
   */
  async confirmUpload(payload: any): Promise<any> {
    const response = await http.post('/media/confirm', payload)
    return response.data
  }
}
