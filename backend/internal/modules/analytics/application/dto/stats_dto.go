// Package analytics_dto defines data transfer objects for the analytics module.
package analytics_dto

// OperationalPulseDTO holds real-time daily warehouse pulse metrics with yesterday comparison.
type OperationalPulseDTO struct {
	OutboundToday           float64 `json:"outboundToday"`
	OutboundYesterday       float64 `json:"outboundYesterday"`
	InboundToday            float64 `json:"inboundToday"`
	InboundYesterday        float64 `json:"inboundYesterday"`
	TransferToday           float64 `json:"transferToday"`
	ListsCompletedToday     int     `json:"listsCompletedToday"`
	ListsCompletedYesterday int     `json:"listsCompletedYesterday"`
	UsersActiveToday        int     `json:"usersActiveToday"`
	PendingStockRequests    int     `json:"pendingStockRequests"`
	TotalActiveSkus         int     `json:"totalActiveSkus"`
	TotalInventoryValue     float64 `json:"totalInventoryValue"`
}

// StockHealthSummaryDTO summarizes 30-day SKU inventory health classification counts.
type StockHealthSummaryDTO struct {
	CriticalCount      int `json:"criticalCount"`
	WarningCount       int `json:"warningCount"`
	SafeCount          int `json:"safeCount"`
	DeadOverstockCount int `json:"deadOverstockCount"`
	EmptyCount         int `json:"emptyCount"`
	NegativeCount      int `json:"negativeCount"`
}

// CriticalSkuWatchItem represents a top critical SKU nearing stockout within 7 days.
type CriticalSkuWatchItem struct {
	ProductID       int     `json:"product_id"`
	SKU             string  `json:"sku"`
	Name            string  `json:"name"`
	CurrentStock    float64 `json:"current_stock"`
	Sold30d         float64 `json:"sold_30d"`
	AvgDailySales   float64 `json:"avg_daily_sales"`
	DaysOfInventory float64 `json:"days_of_inventory"`
}

// TopLocationWatchItem represents a warehouse location with high inventory load.
type TopLocationWatchItem struct {
	LocationID    int     `json:"location_id" db:"location_id"`
	Code          string  `json:"code" db:"code"`
	Building      string  `json:"building" db:"building"`
	Purpose       *string `json:"purpose" db:"purpose"`
	TotalProducts int     `json:"total_products" db:"total_products"`
	TotalQuantity float64 `json:"total_quantity" db:"total_quantity"`
	TotalWeightKg float64 `json:"total_weight_kg" db:"total_weight_kg"`
}

// DashboardWatchlistDTO groups top-5 actionable watchlists for warehouse operators.
type DashboardWatchlistDTO struct {
	CriticalSkus       []CriticalSkuWatchItem     `json:"criticalSkus"`
	DuplicateLocations []DuplicateProductLocation `json:"duplicateLocations"`
	TopLoadedLocations []TopLocationWatchItem     `json:"topLoadedLocations"`
}

// DailyMovementPointDTO represents daily aggregated movement volume for trend charting.
type DailyMovementPointDTO struct {
	Date          string  `json:"date" db:"date"`
	TotalInbound  float64 `json:"total_inbound" db:"total_inbound"`
	TotalOutbound float64 `json:"total_outbound" db:"total_outbound"`
	TotalTransfer float64 `json:"total_transfer" db:"total_transfer"`
}

// BuildingStockSummaryDTO summarizes active locations, SKUs, and stock quantities per building.
type BuildingStockSummaryDTO struct {
	Building       string  `json:"building" db:"building"`
	TotalLocations int     `json:"total_locations" db:"total_locations"`
	TotalSkus      int     `json:"total_skus" db:"total_skus"`
	TotalQuantity  float64 `json:"total_quantity" db:"total_quantity"`
}

// SkuHealthInputRow is an internal projection row used to classify 30-day stock health.
type SkuHealthInputRow struct {
	ProductID    int     `db:"product_id"`
	SKU          string  `db:"sku"`
	Name         string  `db:"name"`
	CurrentStock float64 `db:"current_stock"`
	Sold30d      float64 `db:"sold_30d"`
}

// KpiSummaryResponse represents the aggregated command center payload returned by /stats/kpi-summary.
type KpiSummaryResponse struct {
	ListsCompletedToday  int                       `json:"listsCompletedToday"`
	ItemsPickedToday     int                       `json:"itemsPickedToday"`
	UsersActiveToday     int                       `json:"usersActiveToday"`
	TotalInventoryValue  float64                   `json:"totalInventoryValue"`
	Pulse                OperationalPulseDTO       `json:"pulse"`
	StockHealth          StockHealthSummaryDTO     `json:"stockHealth"`
	Watchlist            DashboardWatchlistDTO     `json:"watchlist"`
	MovementTrend        []DailyMovementPointDTO   `json:"movementTrend"`
	BuildingDistribution []BuildingStockSummaryDTO `json:"buildingDistribution"`
}
