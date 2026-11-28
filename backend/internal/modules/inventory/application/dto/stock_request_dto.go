package inventory_dto

// CreateStockRequest defines the JSON payload for creating a stock transfer or stock opname request.
type CreateStockRequest struct {
	Type           string                   `json:"type" binding:"required,oneof=TRANSFER STOCK_OPNAME"`
	FromLocationID *int                     `json:"fromLocationId"`
	ToLocationID   *int                     `json:"toLocationId"`
	Notes          string                   `json:"notes"`
	Items          []CreateStockRequestItem `json:"items" binding:"required,min=1,dive"`
}

// CreateStockRequestItem defines a single requested product line item.
type CreateStockRequestItem struct {
	ProductID int `json:"productId" binding:"required,min=1"`
	Quantity  int `json:"quantity" binding:"required,gt=0"`
}

// CompleteStockRequest defines the JSON payload for receiving and completing a shipped stock request.
type CompleteStockRequest struct {
	ReceivedItems []CompleteStockRequestItem `json:"receivedItems" binding:"required,dive"`
}

// CompleteStockRequestItem defines the received quantity for one product line item.
type CompleteStockRequestItem struct {
	ProductID        int `json:"productId" binding:"required,min=1"`
	ReceivedQuantity int `json:"receivedQuantity" binding:"min=0"`
}

// BulkActionStockRequest defines the JSON payload for bulk approving or rejecting stock requests.
type BulkActionStockRequest struct {
	Action     string `json:"action" binding:"required,oneof=APPROVE REJECT"`
	RequestIds []int  `json:"requestIds" binding:"required,min=1,dive,min=1"`
}
