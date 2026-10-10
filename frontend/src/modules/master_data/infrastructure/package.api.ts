import { http } from '@/core/infrastructure/http.client'
import type { ProductSearchFilter } from '../domain/product.entity'

export const packageApi = {
  /**
   * Mengambil daftar paket. 
   * Asumsinya menggunakan endpoint produk dengan filter is_package = 1
   */
  async getPackages(params: Record<string, any>): Promise<any> {
    const response = await http.get('/products', { params: { ...params, is_package: 1 } })
    return response.data
  },

  /**
   * Export daftar paket ke file
   */
  async exportPackages(params: Record<string, any>): Promise<any> {
    const response = await http.get('/packages/export', { params, responseType: 'blob' })
    return response
  },

  /**
   * Upload batch update untuk paket
   */
  async uploadPackageUpdate(formData: FormData): Promise<any> {
    const response = await http.post('/packages/batch/update', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  }
}
