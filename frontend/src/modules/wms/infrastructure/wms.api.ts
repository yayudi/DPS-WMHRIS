import { http } from '@/core/infrastructure/http.client'
import type { Product } from '../domain/product.entity'
import type { WmsFilterParams } from '../domain/wms.types'
import type { BatchExecuteResult } from '../domain/offline_scan.entity'
import type { OnHoldFulfillmentSummary, ManualTransferPayload } from '../domain/replenishment.entity'
import { stockApi } from './stock.api'

export interface ExecutePickingPayload {
  transaction_id: number
  movement_id: number
  location_id: number
  qty_done: number
}

export const wmsApi = {
  /**
   * Mengambil produk dari API dengan filter, pagination, dan pencarian di sisi server.
   */
  async fetchProducts(params: WmsFilterParams & Record<string, any>): Promise<{ products: Product[], total: number }> {
    try {
      const response = await http.get('/products', { params })
      if (response.data && Array.isArray(response.data)) {
        return {
          products: response.data,
          total: (response as any).total || 0,
        }
      } else {
        console.warn('Struktur data dari API tidak sesuai:', response.data)
        return { products: [], total: 0 }
      }
    } catch (error) {
      console.error('Gagal mengambil produk dari API:', error)
      throw error
    }
  },

  /**
   * Mengeksekusi pengambilan fisik per item secara real-time.
   */
  async executeTransaction(payload: ExecutePickingPayload): Promise<void> {
    await http.post('/wms/transactions/execute', payload)
  },

  /**
   * Mengeksekusi batch antrean picking yang tersimpan di offline buffer.
   */
  async batchExecuteTransactions(items: ExecutePickingPayload[]): Promise<BatchExecuteResult> {
    const response = await http.post('/wms/transactions/batch-execute', { items })
    return response.data as BatchExecuteResult
  },

  /**
   * Mengambil antrean pesanan yang ditahan karena defisit stok lantai display.
   */
  async fetchOnHoldFulfillments(building?: string): Promise<OnHoldFulfillmentSummary[]> {
    const params: Record<string, string> = {}
    if (building && building !== 'ALL') {
      params.building = building
    }
    const response = await http.get('/wms/fulfillments/on-hold', { params })
    if (Array.isArray(response.data)) {
      return response.data
    }
    return []
  },

  /**
   * Me-release pesanan tertahan setelah lantai display di-replenish secara manual.
   */
  async releaseHeldFulfillment(transactionId: number): Promise<any> {
    const response = await http.post(`/wms/fulfillments/${transactionId}/release`)
    return response.data
  },

  /**
   * Mengeksekusi transfer manual dari lantai STORAGE ke lantai DISPLAY (mendelegasikan ke stockApi).
   */
  async transferStock(payload: ManualTransferPayload): Promise<void> {
    await stockApi.transferStock(payload)
  }
}
