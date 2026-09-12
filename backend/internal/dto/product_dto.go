package dto

type CreateProductRequest struct {
	SKU        string  `json:"sku" binding:"required"`
	Name       string  `json:"name" binding:"required"`
	CategoryID *int    `json:"category_id"`
	Price      float64 `json:"price"`
	IsPackage  bool    `json:"is_package"`
	Weight     float64 `json:"weight"`
	Length     float64 `json:"length"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
}

type UpdateProductRequest struct {
	SKU        string  `json:"sku" binding:"required"`
	Name       string  `json:"name"`
	CategoryID *int    `json:"category_id"`
	Price      float64 `json:"price"`
	IsPackage  bool    `json:"is_package"`
	IsActive   bool    `json:"is_active"`
	Weight     float64 `json:"weight"`
	Length     float64 `json:"length"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
}

type ProductFilterRequest struct {
	Page            int      `form:"page,default=1"`
	Limit           int      `form:"limit,default=20"`
	Search          string   `form:"search"`
	SearchBy        string   `form:"searchBy,default=name"`
	Location        string   `form:"location,default=all"`
	Status          string   `form:"status,default=active"`
	IsPackage       *bool    `form:"is_package"`
	PackageOnly     *bool    `form:"packageOnly"`
	StockStatus     string   `form:"stockStatus,default=all"`
	CategoryInclude []string `form:"categoryInclude"`
	CategoryExclude []string `form:"categoryExclude"`
	BuildingInclude []string `form:"buildingInclude"`
	BuildingExclude []string `form:"buildingExclude"`
	FloorInclude    []string `form:"floorInclude"`
	FloorExclude    []string `form:"floorExclude"`
	Building        string   `form:"building,default=all"`
	Floor           string   `form:"floor,default=all"`
	CategoryID      string   `form:"category_id"`
	SortBy          string   `form:"sortBy,default=sku"`
	SortOrder       string   `form:"sortOrder,default=asc"`
}

type ProductDetailResponse struct {
	ID             int                    `json:"id" db:"id"`
	SKU            string                 `json:"sku" db:"sku"`
	Name           string                 `json:"name" db:"name"`
	Price          float64                `json:"price" db:"price"`
	IsPackage      bool                   `json:"is_package" db:"is_package"`
	IsActive       bool                   `json:"is_active" db:"is_active"`
	CategoryID     *int                   `json:"category_id" db:"category_id"`
	CategoryName   *string                `json:"category_name" db:"category_name"`
	Weight         float64                `json:"weight" db:"weight"`
	TotalStock     int                    `json:"total_stock" db:"total_stock"`
	CurrentStock   *int                   `json:"current_stock,omitempty" db:"current_stock"`
	ThumbnailPath  *string                `json:"thumbnail_path" db:"thumbnail_path"`
	ImagePath      *string                `json:"image_path" db:"image_path"`
	StockLocations []ProductStockLocation `json:"stock_locations" db:"-"`
	Components     []ProductComponent     `json:"components" db:"-"`
	Images         []ProductImage         `json:"images" db:"-"`
}

type ProductImage struct {
	ID            int     `json:"id" db:"id"`
	ProductID     int     `json:"product_id" db:"product_id"`
	MediaID       *int    `json:"media_id" db:"media_id"`
	IsPrimary     bool    `json:"is_primary" db:"is_primary"`
	SortOrder     int     `json:"sort_order" db:"sort_order"`
	MainPath      *string `json:"main_path" db:"main_path"`
	ThumbnailPath *string `json:"thumbnail_path" db:"thumbnail_path"`
	Title         *string `json:"title" db:"title"`
}

type ProductStockLocation struct {
	LocationID   int    `json:"location_id" db:"location_id"`
	LocationCode string `json:"location_code" db:"location_code"`
	Purpose      string `json:"purpose" db:"purpose"`
	Building     string `json:"building" db:"building"`
	Floor        string `json:"floor" db:"floor"`
	Quantity     int    `json:"quantity" db:"quantity"`
}

type ProductComponent struct {
	ComponentProductID int    `json:"component_product_id" db:"component_product_id"`
	Name               string `json:"name" db:"name"`
	SKU                string `json:"sku" db:"sku"`
	Quantity           int    `json:"quantity" db:"quantity"`
	StockAvailable     int    `json:"stock_available" db:"stock_available"`
}

type ProductStockDetailResponse struct {
	LocationID   int    `json:"location_id" db:"location_id"`
	LocationCode string `json:"location_code" db:"location_code"`
	LocationName string `json:"location_name" db:"location_name"`
	Purpose      string `json:"purpose" db:"purpose"`
	Building     string `json:"building" db:"building"`
	Floor        string `json:"floor" db:"floor"`
	Quantity     int    `json:"quantity" db:"quantity"`
}

type ProductHistoryResponse struct {
	ID           int     `json:"id" db:"id"`
	Action       string  `json:"action" db:"action"`
	UserName     *string `json:"user_name" db:"user_name"`
	CreatedAt    string  `json:"created_at" db:"created_at"`
}

type ProductStockTimelineResponse struct {
	ID             int     `json:"id"`
	CreatedAt      string  `json:"created_at"`
	MovementType   string  `json:"movement_type"`
	Quantity       int     `json:"quantity"`
	FromLocationID *int    `json:"from_location_id"`
	ToLocationID   *int    `json:"to_location_id"`
	Notes          *string `json:"notes"`
	UserName       *string `json:"user_name"`
	BalanceAfter   int     `json:"balance_after"`
	NetChange      int     `json:"net_change"`
}

type LinkMediaRequest struct {
	MediaIDs []int `json:"mediaIds" binding:"required"`
}
