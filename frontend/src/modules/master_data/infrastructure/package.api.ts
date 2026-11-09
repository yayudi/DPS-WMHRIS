import { http } from '@/core/infrastructure/http.client'

export const packageApi = {
  /**
   * Mengambil daftar paket. 
   * Asumsinya menggunakan endpoint produk dengan filter is_package = 1
   */
  async getPackages(params: Record<string, any>): Promise<any> {
    const response = await http.get('/products', { params: { ...params, is_package: 1 } })
    return response
  },

  /**
   * Request asynchronous export job untuk daftar paket ke background worker.
   */
  exportPackages(params: Record<string, any>): Promise<any> {
    return http.get('/packages/export', { params })
  },

  /**
   * Upload batch update untuk paket
   */
  uploadPackageUpdate(formData: FormData): Promise<any> {
    return http.upload('/packages/batch/update', formData)
  }
}
