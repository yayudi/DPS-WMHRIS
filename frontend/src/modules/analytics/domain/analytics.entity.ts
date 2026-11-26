export interface OperationalPulse {
  outboundToday: number
  outboundYesterday: number
  inboundToday: number
  inboundYesterday: number
  transferToday: number
  listsCompletedToday: number
  listsCompletedYesterday: number
  usersActiveToday: number
  pendingStockRequests: number
  totalActiveSkus: number
  totalInventoryValue: number
}

export interface StockHealthSummary {
  criticalCount: number
  warningCount: number
  safeCount: number
  deadOverstockCount: number
  emptyCount: number
  negativeCount: number
}

export interface CriticalSkuWatchItem {
  product_id: number
  sku: string
  name: string
  current_stock: number
  sold_30d: number
  avg_daily_sales: number
  days_of_inventory: number
}

export interface DuplicateLocationWatchItem {
  product_id: number
  sku: string
  name: string
  purpose: string | null
  location_count: number
  locations: string
}

export interface TopLocationWatchItem {
  location_id: number
  code: string
  building: string
  purpose: string | null
  total_products: number
  total_quantity: number
  total_weight_kg: number
}

export interface DashboardWatchlist {
  criticalSkus: CriticalSkuWatchItem[]
  duplicateLocations: DuplicateLocationWatchItem[]
  topLoadedLocations: TopLocationWatchItem[]
}

export interface DailyMovementPoint {
  date: string
  total_inbound: number
  total_outbound: number
  total_transfer: number
}

export interface BuildingStockSummary {
  building: string
  total_locations: number
  total_skus: number
  total_quantity: number
}

export interface KpiSummary {
  listsCompletedToday: number
  itemsPickedToday: number
  usersActiveToday: number
  totalInventoryValue: number
  pulse?: OperationalPulse
  stockHealth?: StockHealthSummary
  watchlist?: DashboardWatchlist
  movementTrend?: DailyMovementPoint[]
  buildingDistribution?: BuildingStockSummary[]
}

export interface ReportFilter {
  [key: string]: unknown
}

export interface ExportJob {
  id: number
  status: string
  file_url?: string
  created_at: string
}
