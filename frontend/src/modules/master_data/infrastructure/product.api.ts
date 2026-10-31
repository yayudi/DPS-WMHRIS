import { http } from '@/core/infrastructure/http.client'
import type { ProductSearchFilter } from '../domain/product.entity'
import { packageApi } from './package.api'

export const productApi = {
  /**
   * Mengambil produk dengan parameter paginasi & filter kompleks
   */
  async getProducts(params: Record<string, any>): Promise<any> {
    const response = await http.get('/products', { params })
    return response.data
  },

  async createProduct(payload: any): Promise<any> {
    const response = await http.post('/products', payload)
    return response.data
  },

  /**
   * Mencari produk berdasarkan nama/SKU.
   */
  async searchProducts(filter: ProductSearchFilter | { q: string; [key: string]: any }): Promise<any> {
    const params: Record<string, any> = { q: filter.q, page: filter.page || 1, limit: filter.limit || 20 }
    if (filter.locationId) params.locationId = filter.locationId
    if (filter.inStockOnly) params.inStockOnly = true

    const response = await http.get('/products/search', { params })
    return response.data || response // Tangani struktur paginasi atau list biasa
  },

  async updateProduct(id: number | string, payload: any): Promise<any> {
    const response = await http.put(`/products/${id}`, payload)
    return response.data
  },

  async deleteProduct(id: number | string): Promise<any> {
    const response = await http.delete(`/products/${id}`)
    return response.data
  },

  async bulkAction(actionType: 'archive' | 'restore', ids: (number | string)[]): Promise<any> {
    const response = await http.post(`/products/batch/${actionType}`, { ids })
    return response.data
  },

  async exportProducts(params: Record<string, any>): Promise<any> {
    const response = await http.get('/products/export', { params })
    return response
  },

  /**
   * @deprecated Pindah ke packageApi.exportPackages
   */
  async exportPackages(params: Record<string, any>): Promise<any> {
    return packageApi.exportPackages(params)
  },

  /**
   * @deprecated Pindah ke packageApi.uploadPackageUpdate
   */
  async uploadPackageUpdate(formData: FormData): Promise<any> {
    return packageApi.uploadPackageUpdate(formData)
  },

  /**
   * Mengambil detail produk LENGKAP berdasarkan ID.
   */
  async fetchProductById(id: number | string): Promise<any> {
    const response = await http.get(`/products/${id}`)
    return response.data
  },

  /**
   * Menghubungkan media asset ke produk.
   */
  async linkMedia(productId: number | string, payload: { mediaId?: number; mediaIds?: number[]; isPrimary?: boolean }): Promise<any> {
    const response = await http.post(`/products/${productId}/link-media`, payload)
    return response.data
  },

  /**
   * Menghapus gambar produk (relasi pivot).
   */
  async deleteProductImage(productId: number | string, imageId: number | string): Promise<any> {
    const response = await http.delete(`/products/${productId}/images/${imageId}`)
    return response.data
  },

  /**
   * Menjadikan gambar produk sebagai gambar utama.
   */
  async setPrimaryImage(productId: number | string, imageId: number | string): Promise<any> {
    const response = await http.put(`/products/${productId}/images/${imageId}/primary`)
    return response.data
  },

  /**
   * Mengambil riwayat audit log produk.
   */
  async fetchProductHistory(productId: number | string): Promise<any> {
    const response = await http.get(`/products/${productId}/history`)
    return response.data
  },

  /**
   * Mengambil daftar produk untuk dropdown admin inbound.
   */
  async fetchAllProductsAdminList(): Promise<any> {
    const response = await http.get('/products/admin-list')
    return response.data
  },

  /**
   * Mengambil detail stok (per lokasi) untuk satu produk.
   */
  async fetchProductStockDetails(productId: number | string): Promise<any> {
    const response = await http.get(`/products/${productId}/stock-details`)
    return response.data
  },

  /**
   * Mengambil sampel SKU/Produk yang ada di lokasi tertentu.
   */
  async fetchStockSampleForLocation(locationId: number | string): Promise<any> {
    const response = await http.get(`/locations/${locationId}/stock-sample`)
    return response.data
  },

  /**
   * Upload file untuk pembaruan harga produk secara massal.
   */
  uploadPriceUpdate(formData: FormData): Promise<any> {
    return http.post('/products/batch/product-update', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  /**
   * Mengambil waktu terakhir harga produk diubah.
   */
  async fetchProductLastPriceUpdate(productId: number | string): Promise<string | null> {
    const response = await http.get(`/products/${productId}/last-price-update`)
    return response.data?.last_price_update || null
  }
}
