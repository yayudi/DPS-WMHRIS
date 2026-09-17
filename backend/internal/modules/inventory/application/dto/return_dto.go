package inventory_dto

type ApproveReturnRequest struct {
	ItemID      int    `json:"itemId" validate:"required,min=1"`
	QtyAccepted int    `json:"qtyAccepted" validate:"required,min=1"`
	LocationID  int    `json:"locationId" validate:"required,min=1"`
	Condition   string `json:"condition" validate:"required,oneof=GOOD BAD"`
	Notes       string `json:"notes"`
}

type CreateManualReturnRequest struct {
	ProductID  int    `json:"productId" validate:"required,min=1"`
	Quantity   int    `json:"quantity" validate:"required,min=1"`
	Condition  string `json:"condition" validate:"required,oneof=GOOD BAD"`
	LocationID int    `json:"locationId" validate:"required,min=1"`
	Reference  string `json:"reference"`
	Notes      string `json:"notes"`
}
