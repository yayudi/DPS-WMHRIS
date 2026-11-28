package analytics_dto

// TriStateFilter represents an include/exclude tri-state filter parsed from query JSON or body payloads.
type TriStateFilter struct {
	Include []string `json:"include"`
	Exclude []string `json:"exclude"`
}

// StatisticFilterRequest defines shared query and filter parameters across analytics statistics endpoints.
type StatisticFilterRequest struct {
	StartDate         string `json:"startDate" form:"startDate"`
	EndDate           string `json:"endDate" form:"endDate"`
	SearchQuery       string `json:"searchQuery" form:"searchQuery"`
	Status            string `json:"status" form:"status"` // "all", status literal, or TriStateFilter JSON
	Movement          string `json:"movement" form:"movement"`
	Building          string `json:"building" form:"building"` // string, comma-separated list, or TriStateFilter JSON
	TimeResolution    string `json:"timeResolution" form:"timeResolution"`
	CategoryId        string `json:"categoryId" form:"categoryId"` // string or JSON string
	Purpose           string `json:"purpose" form:"purpose"`       // string or JSON string
	IsPackage         *int   `json:"isPackage" form:"isPackage"`
	StockStatus       string `json:"stockStatus" form:"stockStatus"`
	Source            string `json:"source" form:"source"`     // TriState JSON
	ShopName          string `json:"shopName" form:"shopName"` // TriState JSON
	PrevStartDate     string `json:"prevStartDate" form:"prevStartDate"`
	PrevEndDate       string `json:"prevEndDate" form:"prevEndDate"`
	PackageCategoryId string `json:"packageCategoryId" form:"packageCategoryId"` // JSON string
	Floor             string `json:"floor" form:"floor"`                         // JSON string
	ExportName        string `json:"exportName" form:"exportName"`
}

// ExportStatisticRequest defines the HTTP payload to queue a stock movement statistics export job.
type ExportStatisticRequest struct {
	StartDate   string `json:"startDate"`
	EndDate     string `json:"endDate"`
	SearchQuery string `json:"searchQuery"`
	Status      any    `json:"status"`
	Movement    string `json:"movement"`
	Building    any    `json:"building"`
	CategoryId  any    `json:"categoryId"`
	ExportName  string `json:"exportName"`
}

// ExportTimelineRequest defines the HTTP payload to queue a stock timeline export job.
type ExportTimelineRequest struct {
	StartDate   string `json:"startDate"`
	EndDate     string `json:"endDate"`
	SearchQuery string `json:"searchQuery"`
	Status      any    `json:"status"`
	ExportName  string `json:"exportName"`
	Movement    string `json:"movement"`
	Building    any    `json:"building"`
}

// ExportLocationCapacityRequest defines the HTTP payload to queue a location capacity export job.
type ExportLocationCapacityRequest struct {
	SearchQuery  string `json:"searchQuery"`
	CategoryId   any    `json:"categoryId"`
	Purpose      any    `json:"purpose"`
	Building     any    `json:"building"`
	Floor        any    `json:"floor"`
	ExportName   string `json:"exportName"`
	ExportFormat string `json:"exportFormat"` // "summary" or "detailed"
}

// StockMovementSummaryResponse summarizes movement velocity, days of inventory, and health status per SKU.
type StockMovementSummaryResponse struct {
	ProductID       int      `json:"product_id" db:"product_id"`
	SKU             string   `json:"sku" db:"sku"`
	Name            string   `json:"name" db:"name"`
	IsActive        int      `json:"is_active" db:"is_active"`
	CurrentStock    float64  `json:"current_stock" db:"current_stock"`
	TotalSold       float64  `json:"total_sold" db:"total_sold"`
	TotalInbound    float64  `json:"total_inbound" db:"total_inbound"`
	AvgDailySales   float64  `json:"avg_daily_sales"`
	DaysOfInventory *float64 `json:"days_of_inventory"`
	Status          string   `json:"status"`
}

// StockMovementTimelineResponse represents inbound and outbound stock volume for a single time bucket.
type StockMovementTimelineResponse struct {
	Date     string  `json:"date" db:"date"`
	TotalOut float64 `json:"total_out" db:"total_out"`
	TotalIn  float64 `json:"total_in" db:"total_in"`
}

// StockMovementResponse combines per-SKU summaries with the aggregated timeline series.
type StockMovementResponse struct {
	Summary  []StockMovementSummaryResponse  `json:"summary"`
	Timeline []StockMovementTimelineResponse `json:"timeline"`
}

// StockBuildingBreakdownResponse represents stock distribution of a single product per building.
type StockBuildingBreakdownResponse struct {
	Building     string  `json:"building" db:"building"`
	CurrentStock float64 `json:"current_stock" db:"current_stock"`
	TotalOut     float64 `json:"total_out" db:"total_out"`
	TotalInbound float64 `json:"total_inbound" db:"total_inbound"`
}

// StockTimelineResponse represents inbound, outbound, and net stock change per time bucket.
type StockTimelineResponse struct {
	Date      string  `json:"date" db:"date"`
	TotalIn   float64 `json:"totalIn" db:"total_in"`
	TotalOut  float64 `json:"totalOut" db:"total_out"`
	NetChange float64 `json:"netChange"`
}

// InventoryValueResponse summarizes quantity, total valuation, portfolio share, and stock status per SKU.
type InventoryValueResponse struct {
	ProductID     int     `json:"product_id" db:"product_id"`
	SKU           string  `json:"sku" db:"sku"`
	Name          string  `json:"name" db:"name"`
	CategoryID    *int    `json:"category_id" db:"category_id"`
	Category      *string `json:"category" db:"category"`
	Price         float64 `json:"price" db:"price"`
	TotalQuantity float64 `json:"total_quantity" db:"total_quantity"`
	TotalValue    float64 `json:"total_value" db:"total_value"`
	Percentage    float64 `json:"percentage"`
	Status        string  `json:"status"`
}

// ShopPerformanceSummary summarizes order, item, and revenue metrics per sales channel shop.
type ShopPerformanceSummary struct {
	Source         *string `json:"source" db:"source"`
	ShopName       string  `json:"shop_name" db:"shop_name"`
	TotalOrders    float64 `json:"total_orders" db:"total_orders"`
	TotalItemsSold float64 `json:"total_items_sold" db:"total_items_sold"`
	TotalRevenue   float64 `json:"total_revenue" db:"total_revenue"`
}

// DailySalesTrend represents daily aggregated order count, item count, and revenue.
type DailySalesTrend struct {
	Date           string  `json:"date" db:"date"`
	TotalOrders    float64 `json:"totalOrders" db:"total_orders"`
	TotalItemsSold float64 `json:"totalItemsSold" db:"total_items_sold"`
	TotalRevenue   float64 `json:"totalRevenue" db:"total_revenue"`
}

// TopSellingProduct represents a top-performing SKU ranked by sales volume and revenue.
type TopSellingProduct struct {
	Source      *string `json:"source" db:"source"`
	ShopName    string  `json:"shopName" db:"shop_name"`
	SKU         string  `json:"sku" db:"sku"`
	ProductName string  `json:"productName" db:"product_name"`
	TotalSold   float64 `json:"totalSold" db:"total_sold"`
	Revenue     float64 `json:"revenue" db:"revenue"`
}

// FulfillmentHealth summarizes order completion, cancellation, and return rates per shop.
type FulfillmentHealth struct {
	Source           *string `json:"source" db:"source"`
	ShopName         string  `json:"shopName" db:"shop_name"`
	TotalOrders      float64 `json:"totalOrders" db:"total_orders"`
	CompletedOrders  float64 `json:"completedOrders" db:"completed_orders"`
	CancelledOrders  float64 `json:"cancelledOrders" db:"cancelled_orders"`
	ReturnedOrders   float64 `json:"returnedOrders" db:"returned_orders"`
	PendingOrders    float64 `json:"pendingOrders" db:"pending_orders"`
	CompletionRate   float64 `json:"completionRate"`
	CancellationRate float64 `json:"cancellationRate"`
	ReturnRate       float64 `json:"returnRate"`
}

// PeriodMetrics aggregates orders, items sold, and revenue over a date range.
type PeriodMetrics struct {
	TotalOrders    float64 `json:"totalOrders"`
	TotalItemsSold float64 `json:"totalItemsSold"`
	TotalRevenue   float64 `json:"totalRevenue"`
}

// PeriodComparison compares current period metrics against a previous period with percentage deltas.
type PeriodComparison struct {
	Current  PeriodMetrics `json:"current"`
	Previous PeriodMetrics `json:"previous"`
	Delta    PeriodMetrics `json:"delta"`
}

// ShopPerformanceResponse combines shop summaries, daily trends, top products, fulfillment health, and period comparison.
type ShopPerformanceResponse struct {
	Summary     []ShopPerformanceSummary `json:"summary"`
	DailyTrend  []DailySalesTrend        `json:"dailyTrend"`
	TopProducts []TopSellingProduct      `json:"topProducts"`
	Fulfillment []FulfillmentHealth      `json:"fulfillment"`
	Comparison  *PeriodComparison        `json:"comparison,omitempty"`
}

// PackageComponentPackageInfo describes one parent package's demand contribution for a component SKU.
type PackageComponentPackageInfo struct {
	PackageSKU        string  `json:"package_sku"`
	PackageName       string  `json:"package_name"`
	PackageCategoryID *int    `json:"package_category_id"`
	Sold              float64 `json:"sold"`
	QtyPerPackage     float64 `json:"qty_per_package"`
	SubtotalNeeded    float64 `json:"subtotal_needed"`
}

// PackageComponentAnalysisResponse aggregates component demand across all packages and computes deficit status.
type PackageComponentAnalysisResponse struct {
	ComponentProductID int                           `json:"component_product_id"`
	SKU                string                        `json:"sku"`
	Name               string                        `json:"name"`
	CategoryID         *int                          `json:"category_id"`
	CurrentStock       float64                       `json:"current_stock"`
	TotalNeeded        float64                       `json:"total_needed"`
	Packages           []PackageComponentPackageInfo `json:"packages"`
	Deficit            float64                       `json:"deficit"`
	Status             string                        `json:"status"`
}

// LocationLoad summarizes product count, stock quantity, weight, and CBM volume per active location.
type LocationLoad struct {
	LocationID    int     `json:"location_id" db:"location_id"`
	Code          string  `json:"code" db:"code"`
	Name          string  `json:"name" db:"name"`
	Building      *string `json:"building" db:"building"`
	Floor         *string `json:"floor" db:"floor"`
	Purpose       *string `json:"purpose" db:"purpose"`
	TotalProducts float64 `json:"total_products" db:"total_products"`
	TotalQuantity float64 `json:"total_quantity" db:"total_quantity"`
	TotalWeight   float64 `json:"total_weight" db:"total_weight"`
	TotalCBM      float64 `json:"total_cbm" db:"total_cbm"`
}

// DuplicateProductLocation identifies a product stored across multiple locations sharing the same purpose.
type DuplicateProductLocation struct {
	ProductID     int     `json:"product_id" db:"product_id"`
	SKU           string  `json:"sku" db:"sku"`
	Name          string  `json:"name" db:"name"`
	Purpose       *string `json:"purpose" db:"purpose"`
	LocationCount float64 `json:"location_count" db:"location_count"`
	Locations     string  `json:"locations" db:"location_codes"`
}

// LocationAnalysisResponse combines per-location loads and multi-location duplicate SKU warnings.
type LocationAnalysisResponse struct {
	LocationLoads     []LocationLoad             `json:"locationLoads"`
	DuplicateProducts []DuplicateProductLocation `json:"duplicateProducts"`
}

// LocationCapacityDetailResponse describes per-SKU quantity, weight, and CBM stored at a specific location.
type LocationCapacityDetailResponse struct {
	ProductID    int     `json:"product_id" db:"product_id"`
	SKU          string  `json:"sku" db:"sku"`
	Name         string  `json:"name" db:"name"`
	CategoryID   int     `json:"category_id" db:"category_id"`
	CategoryName string  `json:"category_name" db:"category_name"`
	Quantity     int     `json:"quantity" db:"quantity"`
	TotalWeight  float64 `json:"total_weight" db:"total_weight"`
	TotalCBM     float64 `json:"total_cbm" db:"total_cbm"`
}

// PackageComponentDBRow is the database projection row used to aggregate package component demand.
type PackageComponentDBRow struct {
	ComponentProductID  int     `db:"component_product_id"`
	ComponentSKU        string  `db:"component_sku"`
	ComponentName       string  `db:"component_name"`
	ComponentCategoryID *int    `db:"component_category_id"`
	CurrentStock        float64 `db:"current_stock"`
	PackageSKU          string  `db:"package_sku"`
	PackageName         string  `db:"package_name"`
	PackageCategoryID   *int    `db:"package_category_id"`
	Sold                float64 `db:"sold"`
	QtyPerPackage       float64 `db:"qty_per_package"`
	SubtotalNeeded      float64 `db:"subtotal_needed"`
}
