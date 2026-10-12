export interface ReturnItem {
  product_id: number
  location_id: number
  quantity: number
  reason: string
}

export interface ReturnData {
  id?: number
  created_at?: string
  user_id?: number
  reference_no?: string
  notes?: string
  items: ReturnItem[]
}
