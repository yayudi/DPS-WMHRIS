export interface SuggestedReplenishmentSource {
  location_id: number
  location_code: string
  building: string
  purpose: string
  available_quantity: number
}

export interface ReplenishmentDeficit {
  product_id: number
  sku: string
  product_name: string
  target_quantity: number
  display_available_quantity: number
  deficit_quantity: number
  suggested_sources: SuggestedReplenishmentSource[]
}

export interface OnHoldFulfillmentSummary {
  transaction_id: number
  transaction_no: string
  reference_type: string
  reference_id: string
  assigned_building: string
  status: 'HOLD_REPLENISHMENT' | 'OUT_OF_STOCK' | string
  notes?: string
  created_at: string
  deficits: ReplenishmentDeficit[]
}

export interface ManualTransferPayload {
  product_id: number
  from_location_id: number
  to_location_id: number
  quantity: number
  notes?: string
}
