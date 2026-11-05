export interface ProductLocationSlot {
  id: number
  product_id: number
  location_id: number
  room: string
  rack: string
  tier?: string | null
  formatted_coordinate: string
  is_primary: boolean
  updated_at: string
}

export interface ProductLocationSlotLog {
  id: number
  product_id: number
  location_id: number
  action: 'INITIAL_ASSIGN' | 'ADDED' | 'MOVED' | 'REMOVED' | 'CLEARED' | string
  from_coordinate?: string | null
  to_coordinate?: string | null
  notes?: string | null
  user_id?: number | null
  user_name?: string
  created_at: string
}

export interface UpsertSlotPayload {
  product_id: number
  location_id: number
  room: string
  rack: string
  tier?: string | null
  is_primary?: boolean
  notes?: string | null
}
