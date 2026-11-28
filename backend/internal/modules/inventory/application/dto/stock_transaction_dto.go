package inventory_dto

// CreateTransactionRequest defines the payload for creating a fulfillment transaction with demand items.
type CreateTransactionRequest struct {
	ReferenceType    string                   `json:"reference_type" binding:"required"`
	ReferenceID      string                   `json:"reference_id" binding:"required"`
	AssignedBuilding string                   `json:"assigned_building"` // Optional metadata, no longer used as hard stock allocation filter
	Items            []TransactionItemRequest `json:"items" binding:"required,min=1,dive"`
	Notes            *string                  `json:"notes"`
}

// TransactionItemRequest defines one product demand entry inside CreateTransactionRequest.
type TransactionItemRequest struct {
	ProductID      uint `json:"product_id" binding:"required,min=1"`
	TargetQuantity int  `json:"target_quantity" binding:"required,gt=0"`
}

// ExecuteTransactionRequest defines the payload for recording a physical picking scan on a movement.
type ExecuteTransactionRequest struct {
	TransactionID uint `json:"transaction_id" binding:"required,min=1"`
	MovementID    uint `json:"movement_id" binding:"required,min=1"`
	LocationID    uint `json:"location_id" binding:"required,min=1"`
	QtyDone       int  `json:"qty_done" binding:"required,gt=0"`
}

// BatchExecuteTransactionRequest defines the payload for syncing multiple picking scans in a single batch.
type BatchExecuteTransactionRequest struct {
	Items []ExecuteTransactionRequest `json:"items" binding:"required,min=1,dive"`
}

// BatchExecuteResult summarizes per-item execution outcomes for BatchExecuteTransactions.
type BatchExecuteResult struct {
	TotalProcessed int      `json:"total_processed"`
	SuccessCount   int      `json:"success_count"`
	FailureCount   int      `json:"failure_count"`
	Errors         []string `json:"errors,omitempty"`
}
