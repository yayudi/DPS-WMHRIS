package model

import "time"

type StockLocation struct {
	ID         int       `db:"id" json:"id"`
	ProductID  int       `db:"product_id" json:"product_id"`
	LocationID int       `db:"location_id" json:"location_id"`
	Quantity   int       `db:"quantity" json:"quantity"`
	UpdatedAt  time.Time `db:"updated_at" json:"updated_at"`
}

type StockMovement struct {
	ID             int       `db:"id" json:"id"`
	ProductID      int       `db:"product_id" json:"product_id"`
	Quantity       int       `db:"quantity" json:"quantity"`
	FromLocationID *int      `db:"from_location_id" json:"from_location_id"` // Pointer untuk NULL (misal barang masuk dari supplier)
	ToLocationID   *int      `db:"to_location_id" json:"to_location_id"`     // Pointer untuk NULL (misal barang keluar/terjual)
	MovementType   string    `db:"movement_type" json:"movement_type"`
	UserID         int       `db:"user_id" json:"user_id"`
	Notes          string    `db:"notes" json:"notes"`
	CreatedAt      time.Time `db:"created_at" json:"created_at"`
}
