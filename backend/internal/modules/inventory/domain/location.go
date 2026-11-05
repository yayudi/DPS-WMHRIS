package domain

import (
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type Location struct {
	kernel.ImmutableEntity
	kernel.SoftDeletable
	Code                string `db:"code" json:"code"`
	Building            string `db:"building" json:"building"`
	Floor               *int   `db:"floor" json:"floor"` // Menggunakan pointer karena 0 berarti lantai dasar, berbeda dengan NULL
	Name                string `db:"name" json:"name"`
	Purpose             string `db:"purpose" json:"purpose"`
	IsActive            bool   `db:"is_active" json:"is_active"`
	IsFulfillmentSource bool   `db:"is_fulfillment_source" json:"is_fulfillment_source"` // Flag sumber stok fulfillment otomatis
}

type AvailableLocationStock struct {
	LocationID        int `db:"location_id" json:"location_id"`
	AvailableQuantity int `db:"available_quantity" json:"available_quantity"`
}
