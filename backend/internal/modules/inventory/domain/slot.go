package domain

import (
	"errors"
	"fmt"
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

var (
	// ErrSlotRoomRequired occurs when room name or code is missing.
	ErrSlotRoomRequired = errors.New("ruang is required")
	// ErrSlotRackRequired occurs when rack code is missing.
	ErrSlotRackRequired = errors.New("rak is required")
	// ErrSlotNotFound occurs when a product location slot does not exist.
	ErrSlotNotFound = errors.New("product location slot not found")
)

const (
	// SlotActionInitialAssign indicates first-time slotting coordinate assignment.
	SlotActionInitialAssign = "INITIAL_ASSIGN"
	// SlotActionAdded indicates adding a new rack coordinate for a product.
	SlotActionAdded = "ADDED"
	// SlotActionMoved indicates relocation from one rack coordinate to another.
	SlotActionMoved = "MOVED"
	// SlotActionRemoved indicates removing a specific rack coordinate.
	SlotActionRemoved = "REMOVED"
	// SlotActionCleared indicates unassigning or clearing all slotting coordinates.
	SlotActionCleared = "CLEARED"
)

// ProductLocationSlot represents active slotting coordinate metadata for a product at a specific location.
type ProductLocationSlot struct {
	kernel.BaseEntity
	ProductID           int     `db:"product_id" json:"product_id"`
	LocationID          int     `db:"location_id" json:"location_id"`
	Room                string  `db:"room" json:"room"`
	Rack                string  `db:"rack" json:"rack"`
	Tier                *string `db:"tier" json:"tier"`
	FormattedCoordinate string  `db:"formatted_coordinate" json:"formatted_coordinate"`
	IsPrimary           bool    `db:"is_primary" json:"is_primary"`
	UpdatedBy           *int    `db:"updated_by" json:"updated_by"`
}

// ProductLocationSlotLog records historical movement and slotting changes.
type ProductLocationSlotLog struct {
	kernel.ImmutableEntity
	ProductID      int     `db:"product_id" json:"product_id"`
	LocationID     int     `db:"location_id" json:"location_id"`
	Action         string  `db:"action" json:"action"`
	FromCoordinate *string `db:"from_coordinate" json:"from_coordinate"`
	ToCoordinate   *string `db:"to_coordinate" json:"to_coordinate"`
	Notes          *string `db:"notes" json:"notes"`
	UserID         *int    `db:"user_id" json:"user_id"`
	UserName       string  `db:"user_name" json:"user_name,omitempty"` // populated via join for UI display
}

// FormatCoordinate produces the standard Ruang - Rak - Tingkat string.
func FormatCoordinate(room, rack string, tier *string) string {
	r := strings.TrimSpace(room)
	rk := strings.TrimSpace(rack)
	if tier != nil && strings.TrimSpace(*tier) != "" {
		t := strings.TrimSpace(*tier)
		return fmt.Sprintf("%s - %s - %s", r, rk, t)
	}
	return fmt.Sprintf("%s - %s", r, rk)
}
