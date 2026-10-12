export interface AdjustmentItem {
  product_id: number
  location_id: number
  actual_quantity: number
  difference?: number
  reason: string
}

export interface Adjustment {
  id?: number
  created_at?: string
  user_id?: number
  notes?: string
  items: AdjustmentItem[]
}
