import { http } from '@/core/infrastructure/http.client'
import axios from '@/core/infrastructure/http.client'
import type { Product } from '../domain/product.entity'
import type { WmsFilterParams } from '../domain/wms.types'

export const wmsApi = {
  /**
   * Mengambil produk dari API dengan filter, pagination, dan pencarian di sisi server.
   */
  async fetchProducts(params: WmsFilterParams & Record<string, any>): Promise<{ products: Product[], total: number }> {
    try {
      const response = await axios.get('/products', { params })
      if (response.data && Array.isArray(response.data.data)) {
        return {
          products: response.data.data,
          total: response.data.total || 0,
        }
      } else {
        console.warn('Struktur data dari API tidak sesuai:', response.data)
        return { products: [], total: 0 }
      }
    } catch (error) {
      console.error('Gagal mengambil produk dari API:', error)
      throw error
    }
  }
}
