package inventory_dto

type CreateStockRequest struct {
	Type           string                   `json:"type" binding:"required"`
	FromLocationID *int                     `json:"fromLocationId"`
	ToLocationID   *int                     `json:"toLocationId"`
	Notes          string                   `json:"notes"`
	Items          []CreateStockRequestItem `json:"items" binding:"required,min=1"`
}

type CreateStockRequestItem struct {
	ProductID int `json:"productId" binding:"required"`
	Quantity  int `json:"quantity" binding:"required,gt=0"`
}

type CompleteStockRequest struct {
	ReceivedItems []CompleteStockRequestItem `json:"receivedItems" binding:"required"`
}

type CompleteStockRequestItem struct {
	ProductID        int `json:"productId" binding:"required"`
	ReceivedQuantity int `json:"receivedQuantity" binding:"min=0"`
}

type BulkActionStockRequest struct {
	Action     string `json:"action" binding:"required,oneof=APPROVE REJECT"`
	RequestIds []int  `json:"requestIds" binding:"required,min=1"`
}
