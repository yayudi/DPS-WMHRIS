package inventory_dto

// ApproveReturnRequest defines the HTTP payload for approving a legacy marketplace return item.
type ApproveReturnRequest struct {
	ItemID      int    `json:"itemId" binding:"required,min=1"`
	QtyAccepted int    `json:"qtyAccepted" binding:"required,min=1"`
	LocationID  int    `json:"locationId" binding:"required,min=1"`
	Condition   string `json:"condition" binding:"required,oneof=GOOD BAD"`
	Notes       string `json:"notes"`
}

// CreateManualReturnRequest defines the HTTP payload for recording a manual customer return.
type CreateManualReturnRequest struct {
	ProductID  int    `json:"productId" binding:"required,min=1"`
	Quantity   int    `json:"quantity" binding:"required,min=1"`
	Condition  string `json:"condition" binding:"required,oneof=GOOD BAD"`
	LocationID int    `json:"locationId" binding:"required,min=1"`
	Reference  string `json:"reference"`
	Notes      string `json:"notes"`
}
