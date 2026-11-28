package domain

import (
	"time"

	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

// StockLocation records product physical and reserved quantities in a specific physical location.
// Manual ID and UpdatedAt are kept because the table does not have a created_at column.
type StockLocation struct {
	ID               int       `db:"id" json:"id"`
	ProductID        int       `db:"product_id" json:"product_id"`
	LocationID       int       `db:"location_id" json:"location_id"`
	Quantity         int       `db:"quantity" json:"quantity"`
	ReservedQuantity int       `db:"reserved_quantity" json:"reserved_quantity"`
	UpdatedAt        time.Time `db:"updated_at" json:"updated_at"`
}

// AvailableQuantity returns the unreserved quantity available for allocation, clamped at zero.
func (s StockLocation) AvailableQuantity() int {
	avail := s.Quantity - s.ReservedQuantity
	if avail < 0 {
		return 0
	}
	return avail
}

// StockMovement represents an append-only audit log of stock balance transitions.
type StockMovement struct {
	kernel.ImmutableEntity
	ProductID      int    `db:"product_id" json:"product_id"`
	Quantity       int    `db:"quantity" json:"quantity"`
	FromLocationID *int   `db:"from_location_id" json:"from_location_id"` // Pointer for NULL (e.g., inbound from supplier)
	ToLocationID   *int   `db:"to_location_id" json:"to_location_id"`     // Pointer for NULL (e.g., outbound/sold)
	MovementType   string `db:"movement_type" json:"movement_type"`
	UserID         int    `db:"user_id" json:"user_id"`
	Notes          string `db:"notes" json:"notes"`
}
