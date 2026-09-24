package inventory_dto

type CreateFulfillmentRequest struct {
	ReferenceType    string                   `json:"reference_type" binding:"required"`
	ReferenceID      string                   `json:"reference_id" binding:"required"`
	AssignedBuilding string                   `json:"assigned_building" binding:"required"`
	Items            []FulfillmentItemRequest `json:"items" binding:"required,min=1"`
	Notes            *string                  `json:"notes"`
}

type FulfillmentItemRequest struct {
	ProductID      uint `json:"product_id" binding:"required"`
	TargetQuantity int  `json:"target_quantity" binding:"required,gt=0"`
}

type ExecuteFulfilmentRequest struct {
	TransactionID uint `json:"transaction_id" binding:"required"`
	MovementID    uint `json:"movement_id" binding:"required"`
	LocationID    uint `json:"location_id" binding:"required"`
	QtyDone       int  `json:"qty_done" binding:"required,gt=0"`
}
