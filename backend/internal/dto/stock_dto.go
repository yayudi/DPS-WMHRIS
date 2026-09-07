package dto

type MoveStockRequest struct {
	ProductID      int    `json:"product_id" binding:"required"`
	Quantity       int    `json:"quantity" binding:"required,gt=0"` // Harus lebih dari 0
	MovementType   string `json:"movement_type" binding:"required"`
	FromLocationID *int   `json:"from_location_id"`
	ToLocationID   *int   `json:"to_location_id"`
	Notes          string `json:"notes"`
}

type TransferStockRequest struct {
	ProductID      int    `json:"product_id" binding:"required"`
	FromLocationID int    `json:"from_location_id" binding:"required"`
	ToLocationID   int    `json:"to_location_id" binding:"required"`
	Quantity       int    `json:"quantity" binding:"required,gt=0"`
	Notes          string `json:"notes"`
}

type AdjustStockRequest struct {
	ProductID  int    `json:"product_id" binding:"required"`
	LocationID int    `json:"location_id" binding:"required"`
	Type       string `json:"type"` // ADJUST_PLUS, ADJUST_MINUS, IN, OUT
	Quantity   int    `json:"quantity" binding:"required"` // Could be negative
	Notes      string `json:"notes"`
}

type StockOpnameItem struct {
	SKU          string `json:"sku"`
	ProductID    int    `json:"product_id"`
	Quantity     int    `json:"quantity"` // Stok aktual
	ToLocationID int    `json:"to_location_id"`
	Notes        string `json:"notes"`
}

type BatchLogResponse struct {
	ID                  int    `json:"id" db:"id"`
	SKU                 string `json:"sku" db:"sku"`
	ProductName         string `json:"product_name" db:"product_name"`
	Quantity            int    `json:"quantity" db:"quantity"`
	MovementType        string `json:"movement_type" db:"movement_type"`
	Notes               string `json:"notes" db:"notes"`
	CreatedAt           string `json:"created_at" db:"created_at"`
	User                string `json:"user" db:"user"`
	FromLocation        string `json:"from_location" db:"from_location"`
	ToLocation          string `json:"to_location" db:"to_location"`
}

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
}

type StockHistoryResponse struct {
	ID                  int    `json:"id" db:"id"`
	Quantity            int    `json:"quantity" db:"quantity"`
	MovementType        string `json:"movement_type" db:"movement_type"`
	Notes               string `json:"notes" db:"notes"`
	CreatedAt           string `json:"created_at" db:"created_at"`
	User                string `json:"user" db:"user"`
	FromLocation        string `json:"from_location" db:"from_location"`
	ToLocation          string `json:"to_location" db:"to_location"`
}

type StockHistoryFilter struct {
	ProductID    int    `uri:"productId" binding:"required"`
	Page         int    `form:"page,default=1"`
	Limit        int    `form:"limit,default=15"`
	MovementType string `form:"movementType"`
	StartDate    string `form:"startDate"`
	EndDate      string `form:"endDate"`
	LocationID   string `form:"locationId"`
	User         string `form:"user"`
}

type BatchMovementRequest struct {
	SKU            string  `json:"sku" binding:"required"`
	Quantity       int     `json:"quantity" binding:"required"`
	FromLocationID *int    `json:"fromLocationId"`
	ToLocationID   *int    `json:"toLocationId"`
	Notes          *string `json:"notes"`
}

type BatchProcessRequest struct {
	Type           string                 `json:"type" binding:"required"` // TRANSFER, TRANSFER_MULTI, INBOUND, RETURN, TRANSFER_OUT, ADJUSTMENT
	FromLocationID *int                   `json:"fromLocationId"`
	ToLocationID   *int                   `json:"toLocationId"`
	Notes          *string                `json:"notes"`
	Movements      []BatchMovementRequest `json:"movements" binding:"required,min=1,dive"`
}

type BatchTransferRequest struct {
	FromLocationID int                    `json:"fromLocationId" binding:"required"`
	ToLocationID   int                    `json:"toLocationId" binding:"required"`
	Movements      []BatchMovementRequest `json:"movements" binding:"required,min=1,dive"`
}

type ValidateReturnRequest struct {
	PickingListItemID  int `json:"pickingListItemId" binding:"required"`
	ReturnToLocationID int `json:"returnToLocationId" binding:"required"`
}

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
