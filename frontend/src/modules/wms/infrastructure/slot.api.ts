import { http } from '@/core/infrastructure/http.client'
import type { ApiResponse } from '@/core/domain/api.types'
import type {
  ProductLocationSlot,
  ProductLocationSlotLog,
  UpsertSlotPayload
} from '../domain/slot.entity'

export interface SlotLogListResponse {
  data: ProductLocationSlotLog[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

/**
 * Repository API untuk koordinat ambalan/rak (Slotting) & audit log (Multi-Rak).
 */
export const slotApi = {
  /**
   * Mengambil semua daftar koordinat rak aktif untuk produk di lokasi tertentu.
   */
  async getSlots(productId: number, locationId: number): Promise<ApiResponse<ProductLocationSlot[]>> {
    return http.get<ProductLocationSlot[]>('/inventory/slots', {
      params: {
        product_id: productId,
        location_id: locationId
      }
    })
  },

  /**
   * Menambahkan koordinat rak baru untuk produk di suatu lokasi.
   */
  async addSlot(payload: UpsertSlotPayload): Promise<ApiResponse<ProductLocationSlot>> {
    return http.post<ProductLocationSlot>('/inventory/slots', payload)
  },

  /**
   * Menghapus salah satu koordinat rak produk.
   */
  async deleteSlot(slotId: number, notes?: string): Promise<ApiResponse<null>> {
    return http.delete<null>(`/inventory/slots/${slotId}`, {
      data: { notes }
    })
  },

  /**
   * Menetapkan salah satu rak sebagai rak utama/picking.
   */
  async setPrimarySlot(productId: number, locationId: number, slotId: number): Promise<ApiResponse<null>> {
    return http.put<null>(`/inventory/slots/${slotId}/primary?product_id=${productId}&location_id=${locationId}`)
  },

  /**
   * Mengambil riwayat perpindahan koordinat ambalan/rak.
   */
  async getSlotLogs(
    productId: number,
    locationId: number,
    page = 1,
    limit = 10
  ): Promise<ApiResponse<ProductLocationSlotLog[]> & { pagination?: SlotLogListResponse['pagination'] }> {
    return http.get<ProductLocationSlotLog[]>('/inventory/slots/logs', {
      params: {
        product_id: productId,
        location_id: locationId,
        page,
        limit
      }
    })
  }
}
