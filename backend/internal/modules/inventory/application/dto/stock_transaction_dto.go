package inventory_dto

type CreateTransactionRequest struct {
	ReferenceType    string                   `json:"reference_type" binding:"required"`
	ReferenceID      string                   `json:"reference_id" binding:"required"`
	AssignedBuilding string                   `json:"assigned_building"` // Optional metadata, no longer used as hard stock allocation filter
	Items            []TransactionItemRequest `json:"items" binding:"required,min=1"`
	Notes            *string                  `json:"notes"`
}

type TransactionItemRequest struct {
	ProductID      uint `json:"product_id" binding:"required"`
	TargetQuantity int  `json:"target_quantity" binding:"required,gt=0"`
}

type ExecuteTransactionRequest struct {
	TransactionID uint `json:"transaction_id" binding:"required"`
	MovementID    uint `json:"movement_id" binding:"required"`
	LocationID    uint `json:"location_id" binding:"required"`
	QtyDone       int  `json:"qty_done" binding:"required,gt=0"`
}

type BatchExecuteTransactionRequest struct {
	Items []ExecuteTransactionRequest `json:"items" binding:"required,min=1"`
}

type BatchExecuteResult struct {
	TotalProcessed int      `json:"total_processed"`
	SuccessCount   int      `json:"success_count"`
	FailureCount   int      `json:"failure_count"`
	Errors         []string `json:"errors,omitempty"`
}
