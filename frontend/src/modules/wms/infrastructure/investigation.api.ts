import { http } from '@/core/infrastructure/http.client'

export interface DuplicateGroupItem {
  id: number
  product_id: number
  sku: string
  name: string
  quantity: number
  from_location?: string
  to_location?: string
  notes?: string
  created_at: string
  [key: string]: unknown
}

export interface DuplicateGroup {
  base_note: string
  movement_type: string
  occurrences: number
  total_sku: number
  items: DuplicateGroupItem[]
  [key: string]: unknown
}

export const investigationApi = {
  async fetchDuplicates(params: Record<string, unknown>): Promise<{ data: DuplicateGroup[]; total: number }> {
    const res = await http.get('/investigation/duplicates', { params })
    return {
      data: res.data || [],
      total: (res as any).total || 0
    }
  },

  async revertDuplicateTransaction(id: number | string): Promise<any> {
    const res = await http.post(`/investigation/revert/${id}`)
    return res.data
  }
}
