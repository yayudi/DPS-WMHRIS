export interface OfflineScanItem {
  id?: number
  transaction_id: number
  movement_id: number
  location_id: number
  qty_done: number
  timestamp: number
  status?: 'PENDING' | 'SYNCING' | 'FAILED'
  error?: string
}

export interface BatchExecuteResult {
  total_processed: number
  success_count: number
  failure_count: number
  errors?: string[]
}
