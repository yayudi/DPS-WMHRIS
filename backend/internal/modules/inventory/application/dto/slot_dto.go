package inventory_dto

import (
	"time"
)

// UpsertSlotRequest represents the payload to add or update a product's slotting coordinate at a location.
type UpsertSlotRequest struct {
	ProductID  int     `json:"product_id" binding:"required"`
	LocationID int     `json:"location_id" binding:"required"`
	Room       string  `json:"room" binding:"required"`
	Rack       string  `json:"rack" binding:"required"`
	Tier       *string `json:"tier"`
	IsPrimary  bool    `json:"is_primary"`
	Notes      *string `json:"notes"`
}

// SetPrimarySlotRequest represents payload to designate a slot as primary.
type SetPrimarySlotRequest struct {
	SlotID int `json:"slot_id" binding:"required"`
}

// DeleteSlotRequest represents optional payload when removing a slot coordinate.
type DeleteSlotRequest struct {
	Notes *string `json:"notes"`
}

// SlotResponse represents active slotting coordinate details.
type SlotResponse struct {
	ID                  int       `json:"id"`
	ProductID           int       `json:"product_id"`
	LocationID          int       `json:"location_id"`
	Room                string    `json:"room"`
	Rack                string    `json:"rack"`
	Tier                *string   `json:"tier"`
	FormattedCoordinate string    `json:"formatted_coordinate"`
	IsPrimary           bool      `json:"is_primary"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// KeljaItemPickingLocation represents location and slotting detail for an item in Kelja picking resolution.
type KeljaItemPickingLocation struct {
	ProductID         int                  `json:"product_id"`
	SKU               string               `json:"sku"`
	ProductName       string               `json:"product_name"`
	QuantityAllocated int                  `json:"quantity_allocated"`
	Location          KeljaLocationSummary `json:"location"`
	Slotting          KeljaSlottingSummary `json:"slotting"`
}

// KeljaLocationSummary represents coarse floor/building location.
type KeljaLocationSummary struct {
	ID       int    `json:"id"`
	Code     string `json:"code"`
	Building string `json:"building"`
	Floor    *int   `json:"floor"`
}

// KeljaSlottingSummary represents fine-grained slotting coordinates for picking guidance.
type KeljaSlottingSummary struct {
	IsSlotted           bool     `json:"is_slotted"`
	Room                *string  `json:"room,omitempty"`
	Rack                *string  `json:"rack,omitempty"`
	Tier                *string  `json:"tier,omitempty"`
	FormattedCoordinate *string  `json:"formatted_coordinate,omitempty"`
	AllCoordinates      []string `json:"all_coordinates,omitempty"`
}

// KeljaPickingLocationsResponse represents the response payload for Kelja picking resolution.
type KeljaPickingLocationsResponse struct {
	ReferenceID   string                     `json:"reference_id"`
	TransactionNo string                     `json:"transaction_no"`
	Status        string                     `json:"status"`
	Items         []KeljaItemPickingLocation `json:"items"`
}
