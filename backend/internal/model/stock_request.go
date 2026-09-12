package model

import "time"

type StockRequest struct {
	ID             int       `db:"id" json:"id"`
	RequestNumber  string    `db:"request_number" json:"request_number"`
	Type           string    `db:"type" json:"type"`
	RequesterID    int       `db:"requester_id" json:"requester_id"`
	FromLocationID *int      `db:"from_location_id" json:"from_location_id"` // Pointer for NULL (external source)
	ToLocationID   *int      `db:"to_location_id" json:"to_location_id"`     // Pointer for NULL (external destination)
	Status         string    `db:"status" json:"status"`
	Notes          string    `db:"notes" json:"notes"`
	CreatedAt      time.Time          `db:"created_at" json:"created_at"`
	UpdatedAt      time.Time          `db:"updated_at" json:"updated_at"`
	
	Items          []StockRequestItem `json:"items" db:"-"` // Explicitly ignored by sqlx
	
	// Joined fields (populated by custom queries, not by BaseRepository)
	RequesterName    string `json:"requester_name" db:"-"`
	FromLocationName string `json:"from_location_name" db:"-"`
	FromLocationCode string `json:"from_location_code" db:"-"`
	ToLocationName   string `json:"to_location_name" db:"-"`
	ToLocationCode   string `json:"to_location_code" db:"-"`
}

type StockRequestItem struct {
	ID               int `db:"id" json:"id"`
	StockRequestID   int `db:"stock_request_id" json:"stock_request_id"`
	ProductID        int `db:"product_id" json:"product_id"`
	Quantity         int `db:"quantity" json:"quantity"`
	ReceivedQuantity int `db:"received_quantity" json:"received_quantity"`
	
	// Joined fields
	ProductName      string `json:"product_name" db:"product_name"`
	SKU              string `json:"sku" db:"sku"`
}
