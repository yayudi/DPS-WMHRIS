package dto

// Advanced Filter Request
type TriStateFilter struct {
	Include []string `json:"include"`
	Exclude []string `json:"exclude"`
}

type StatisticFilterRequest struct {
	StartDate         string      `json:"startDate" form:"startDate"`
	EndDate           string      `json:"endDate" form:"endDate"`
	SearchQuery       string      `json:"searchQuery" form:"searchQuery"`
	Status            string `json:"status" form:"status"`                       // Can be string "all" or TriStateFilter (JSON string from query)
	Movement          string `json:"movement" form:"movement"`
	Building          string `json:"building" form:"building"`                   // Can be string, slice of strings, or TriStateFilter (JSON string)
	TimeResolution    string `json:"timeResolution" form:"timeResolution"`
	CategoryId        string `json:"categoryId" form:"categoryId"`               // string or JSON string
	Purpose           string `json:"purpose" form:"purpose"`                     // string or JSON string
	IsPackage         *int   `json:"isPackage" form:"isPackage"`
	StockStatus       string `json:"stockStatus" form:"stockStatus"`
	Source            string `json:"source" form:"source"`                       // TriState
	ShopName          string `json:"shopName" form:"shopName"`                   // TriState
	PrevStartDate     string `json:"prevStartDate" form:"prevStartDate"`
	PrevEndDate       string `json:"prevEndDate" form:"prevEndDate"`
	PackageCategoryId string `json:"packageCategoryId" form:"packageCategoryId"` // JSON string
	Floor             string `json:"floor" form:"floor"`                         // JSON string
	ExportName        string `json:"exportName" form:"exportName"`
}

// Export Request
type ExportStatisticRequest struct {
	StartDate   string      `json:"startDate"`
	EndDate     string      `json:"endDate"`
	SearchQuery string      `json:"searchQuery"`
	Status      interface{} `json:"status"`
	Movement    string      `json:"movement"`
	Building    interface{} `json:"building"`
	CategoryId  interface{} `json:"categoryId"`
	ExportName  string      `json:"exportName"`
}

type ExportTimelineRequest struct {
	SearchQuery string      `json:"searchQuery"`
	Status      interface{} `json:"status"`
	ExportName  string      `json:"exportName"`
	Movement    string      `json:"movement"`
	Building    interface{} `json:"building"`
}

type ExportLocationCapacityRequest struct {
	SearchQuery  string      `json:"searchQuery"`
	CategoryId   interface{} `json:"categoryId"`
	Purpose      interface{} `json:"purpose"`
	Building     interface{} `json:"building"`
	Floor        interface{} `json:"floor"`
	ExportName   string      `json:"exportName"`
	ExportFormat string      `json:"exportFormat"` // "summary" or "detailed"
}

// Response Structures
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

type StockMovementTimelineResponse struct {
	Date     string  `json:"date" db:"date"`
	TotalOut float64 `json:"total_out" db:"total_out"`
	TotalIn  float64 `json:"total_in" db:"total_in"`
}

type StockMovementResponse struct {
	Summary  []StockMovementSummaryResponse  `json:"summary"`
	Timeline []StockMovementTimelineResponse `json:"timeline"`
}

type StockTimelineResponse struct {
	Date      string  `json:"date" db:"date"`
	TotalIn   float64 `json:"totalIn" db:"total_in"`
	TotalOut  float64 `json:"totalOut" db:"total_out"`
	NetChange float64 `json:"netChange"`
}

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

type ShopPerformanceSummary struct {
	Source         *string `json:"source" db:"source"`
	ShopName       string  `json:"shop_name" db:"shop_name"`
	TotalOrders    float64 `json:"total_orders" db:"total_orders"`
	TotalItemsSold float64 `json:"total_items_sold" db:"total_items_sold"`
	TotalRevenue   float64 `json:"total_revenue" db:"total_revenue"`
}

type DailySalesTrend struct {
	Date           string  `json:"date" db:"date"`
	TotalOrders    float64 `json:"totalOrders" db:"total_orders"`
	TotalItemsSold float64 `json:"totalItemsSold" db:"total_items_sold"`
	TotalRevenue   float64 `json:"totalRevenue" db:"total_revenue"`
}

type TopSellingProduct struct {
	Source      *string `json:"source" db:"source"`
	ShopName    string  `json:"shopName" db:"shop_name"`
	SKU         string  `json:"sku" db:"sku"`
	ProductName string  `json:"productName" db:"product_name"`
	TotalSold   float64 `json:"totalSold" db:"total_sold"`
	Revenue     float64 `json:"revenue" db:"revenue"`
}

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

type PeriodMetrics struct {
	TotalOrders    float64 `json:"totalOrders"`
	TotalItemsSold float64 `json:"totalItemsSold"`
	TotalRevenue   float64 `json:"totalRevenue"`
}

type PeriodComparison struct {
	Current  PeriodMetrics `json:"current"`
	Previous PeriodMetrics `json:"previous"`
	Delta    PeriodMetrics `json:"delta"`
}

type ShopPerformanceResponse struct {
	Summary      []ShopPerformanceSummary `json:"summary"`
	DailyTrend   []DailySalesTrend        `json:"dailyTrend"`
	TopProducts  []TopSellingProduct      `json:"topProducts"`
	Fulfillment  []FulfillmentHealth      `json:"fulfillment"`
	Comparison   *PeriodComparison        `json:"comparison,omitempty"`
}

type PackageComponentPackageInfo struct {
	PackageSKU        string  `json:"package_sku"`
	PackageName       string  `json:"package_name"`
	PackageCategoryID *int    `json:"package_category_id"`
	Sold              float64 `json:"sold"`
	QtyPerPackage     float64 `json:"qty_per_package"`
	SubtotalNeeded    float64 `json:"subtotal_needed"`
}

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

type DuplicateProductLocation struct {
	ProductID     int     `json:"product_id" db:"product_id"`
	SKU           string  `json:"sku" db:"sku"`
	Name          string  `json:"name" db:"name"`
	Purpose       *string `json:"purpose" db:"purpose"`
	LocationCount float64 `json:"location_count" db:"location_count"`
	Locations     string  `json:"locations" db:"location_codes"`
}

type LocationAnalysisResponse struct {
	LocationLoads     []LocationLoad             `json:"locationLoads"`
	DuplicateProducts []DuplicateProductLocation `json:"duplicateProducts"`
}

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

// Package Component Query DTO from DB
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
