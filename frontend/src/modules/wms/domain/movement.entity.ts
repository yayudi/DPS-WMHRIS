export interface MovementItem {
  product_id: number
  sku: string
  quantity: number
  from_location_id: number
  to_location_id: number
}

export interface Movement {
  id?: number
  created_at?: string
  user_id?: number
  notes?: string
  items: MovementItem[]
}
