package inventory_dto

// MoveStockRequest defines the payload for a single atomic stock movement between locations.
type MoveStockRequest struct {
	ProductID      int    `json:"product_id" binding:"required,min=1"`
	Quantity       int    `json:"quantity" binding:"required,gt=0"`
	MovementType   string `json:"movement_type" binding:"required"`
	FromLocationID *int   `json:"from_location_id"`
	ToLocationID   *int   `json:"to_location_id"`
	Notes          string `json:"notes"`
}

// TransferStockRequest defines the HTTP payload for transferring stock between two locations.
type TransferStockRequest struct {
	ProductID      int    `json:"product_id" binding:"required,min=1"`
	FromLocationID int    `json:"from_location_id" binding:"required,min=1"`
	ToLocationID   int    `json:"to_location_id" binding:"required,min=1"`
	Quantity       int    `json:"quantity" binding:"required,gt=0"`
	Notes          string `json:"notes"`
}

// AdjustStockRequest defines the HTTP payload for adjusting stock quantity at a single location.
type AdjustStockRequest struct {
	ProductID  int    `json:"product_id" binding:"required,min=1"`
	LocationID int    `json:"location_id" binding:"required,min=1"`
	Type       string `json:"type" binding:"omitempty,oneof=ADJUST_PLUS ADJUST_MINUS IN OUT"`
	Quantity   int    `json:"quantity" binding:"required"` // Non-zero; may be negative
	Notes      string `json:"notes"`
}

// StockOpnameItem represents a parsed stock opname row targeting a physical count at a location.
type StockOpnameItem struct {
	SKU          string `json:"sku"`
	ProductID    int    `json:"product_id"`
	Quantity     int    `json:"quantity"` // Target actual stock
	ToLocationID int    `json:"to_location_id"`
	Notes        string `json:"notes"`
}

// BatchLogResponse represents a single row in paginated stock movement batch logs.
type BatchLogResponse struct {
	ID           int    `json:"id" db:"id"`
	SKU          string `json:"sku" db:"sku"`
	ProductName  string `json:"product_name" db:"product_name"`
	Quantity     int    `json:"quantity" db:"quantity"`
	MovementType string `json:"movement_type" db:"movement_type"`
	Notes        string `json:"notes" db:"notes"`
	CreatedAt    string `json:"created_at" db:"created_at"`
	User         string `json:"user" db:"user"`
	FromLocation string `json:"from_location" db:"from_location"`
	ToLocation   string `json:"to_location" db:"to_location"`
}

// BatchLogFilter defines query parameters for filtering and paginating stock movement logs.
type BatchLogFilter struct {
	StartDate           string `form:"startDate" json:"startDate"`
	EndDate             string `form:"endDate" json:"endDate"`
	ProductName         string `form:"productName" json:"productName"`
	MovementType        string `form:"movementType" json:"movementType"`
	SourceLocation      string `form:"sourceLocation" json:"sourceLocation"`
	DestinationLocation string `form:"destinationLocation" json:"destinationLocation"`
	UserID              string `form:"userId" json:"userId"`
	Notes               string `form:"notes" json:"notes"`
	Page                int    `form:"page,default=1" json:"page"`
	Limit               int    `form:"limit,default=50" json:"limit"`
	ExportName          string `form:"exportName" json:"exportName"`
	BeforeID            int    `form:"-" json:"-"` // Internal keyset cursor (sm.id < BeforeID) for O(1) chunked exports
	SkipCount           bool   `form:"-" json:"-"` // Internal flag to bypass COUNT(*) and OFFSET for streaming exports
}

// StockHistoryResponse represents a single movement entry in a product's stock history.
type StockHistoryResponse struct {
	ID           int    `json:"id" db:"id"`
	Quantity     int    `json:"quantity" db:"quantity"`
	MovementType string `json:"movement_type" db:"movement_type"`
	Notes        string `json:"notes" db:"notes"`
	CreatedAt    string `json:"created_at" db:"created_at"`
	User         string `json:"user" db:"user"`
	FromLocation string `json:"from_location" db:"from_location"`
	ToLocation   string `json:"to_location" db:"to_location"`
}

// StockHistoryFilter defines URI and query parameters for a product's stock history.
type StockHistoryFilter struct {
	ProductID    int    `uri:"productId" binding:"required,min=1"`
	Page         int    `form:"page,default=1"`
	Limit        int    `form:"limit,default=15"`
	MovementType string `form:"movementType"`
	StartDate    string `form:"startDate"`
	EndDate      string `form:"endDate"`
	LocationID   string `form:"locationId"`
	User         string `form:"user"`
}

// BatchMovementRequest represents one SKU line item within a batch stock operation.
type BatchMovementRequest struct {
	SKU            string  `json:"sku" binding:"required"`
	Quantity       int     `json:"quantity" binding:"required"`
	FromLocationID *int    `json:"fromLocationId"`
	ToLocationID   *int    `json:"toLocationId"`
	Notes          *string `json:"notes"`
}

// BatchProcessRequest defines the HTTP payload for executing multiple stock movements atomically.
type BatchProcessRequest struct {
	Type           string                 `json:"type" binding:"required,oneof=TRANSFER TRANSFER_MULTI INBOUND RETURN TRANSFER_OUT TRANSFER_IN ADJUSTMENT"`
	FromLocationID *int                   `json:"fromLocationId"`
	ToLocationID   *int                   `json:"toLocationId"`
	Notes          *string                `json:"notes"`
	Movements      []BatchMovementRequest `json:"movements" binding:"required,min=1,dive"`
}

// BatchTransferRequest defines the HTTP payload for transferring multiple SKUs between two locations.
type BatchTransferRequest struct {
	FromLocationID int                    `json:"fromLocationId" binding:"required,min=1"`
	ToLocationID   int                    `json:"toLocationId" binding:"required,min=1"`
	Movements      []BatchMovementRequest `json:"movements" binding:"required,min=1,dive"`
}

// ValidateReturnRequest defines the legacy payload for return validation.
type ValidateReturnRequest struct {
	FulfilmentListItemID int `json:"fulfilmentListItemId" binding:"required,min=1"`
	ReturnToLocationID   int `json:"returnToLocationId" binding:"required,min=1"`
}

// BatchLogExportRequest defines the HTTP payload for queuing an async stock movement export job.
type BatchLogExportRequest struct {
	StartDate           string `json:"startDate" binding:"required"`
	EndDate             string `json:"endDate" binding:"required"`
	ProductName         string `json:"productName"`
	MovementType        string `json:"movementType"`
	SourceLocation      string `json:"sourceLocation"`
	DestinationLocation string `json:"destinationLocation"`
	UserID              int    `json:"userId"`
	Notes               string `json:"notes"`
	Format              string `json:"format"`
	ExportName          string `json:"exportName"`
}
