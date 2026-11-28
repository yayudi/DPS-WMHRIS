package inventory_dto

// StockBalanceResponse represents physical, reserved, and net available stock at a location for one product.
type StockBalanceResponse struct {
	LocationID        int    `json:"location_id" db:"location_id"`
	LocationName      string `json:"location_name" db:"location_name"`
	ProductID         int    `json:"product_id" db:"product_id"`
	ProductName       string `json:"product_name" db:"product_name"`
	Quantity          int    `json:"quantity" db:"quantity"`
	ReservedQuantity  int    `json:"reserved_quantity" db:"reserved_quantity"`
	AvailableQuantity int    `json:"available_quantity" db:"available_quantity"`
}
