package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

// Location represents a physical warehouse, display, or branch storage location row in the locations table.
type Location struct {
	kernel.ImmutableEntity
	kernel.SoftDeletable
	Code                string `db:"code" json:"code"`
	Building            string `db:"building" json:"building"`
	Floor               *int   `db:"floor" json:"floor"` // Pointer distinguishes ground floor (0) from NULL
	Name                string `db:"name" json:"name"`
	Purpose             string `db:"purpose" json:"purpose"`
	IsActive            bool   `db:"is_active" json:"is_active"`
	IsFulfillmentSource bool   `db:"is_fulfillment_source" json:"is_fulfillment_source"`
}

// AvailableLocationStock represents net available (unreserved) stock quantity at a single location.
type AvailableLocationStock struct {
	LocationID        int `db:"location_id" json:"location_id"`
	AvailableQuantity int `db:"available_quantity" json:"available_quantity"`
}
