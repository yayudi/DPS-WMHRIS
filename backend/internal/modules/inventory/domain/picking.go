package domain

import "time"

// PickingList represents the picking_lists table
type PickingList struct {
	ID                int        `db:"id"`
	UserID            int        `db:"user_id"`
	OriginalInvoiceID *string    `db:"original_invoice_id"`
	Source            *string    `db:"source"` // Tokopedia, Shopee, dll
	Status            string     `db:"status"` // PENDING, VALIDATED, DONE, OBSOLETE, VOID, CANCELLED
	IsActive          bool       `db:"is_active"`
	CustomerName      *string    `db:"customer_name"`
	OrderDate         *time.Time `db:"order_date"`
	CreatedAt         time.Time  `db:"created_at"`
	UpdatedAt         time.Time  `db:"updated_at"`
	MarketplaceStatus *string    `db:"marketplace_status"`
	LocationPurpose   *string    `db:"location_purpose"`
	ShopName          *string    `db:"shop_name"`
}

// PickingListItem represents the picking_list_items table
type PickingListItem struct {
	ID                   int       `db:"id"`
	PickingListID        int       `db:"picking_list_id"`
	ProductID            int       `db:"product_id"`
	Quantity             int       `db:"quantity"`
	SuggestedLocationID  *int      `db:"suggested_location_id"`
	PickedFromLocationID *int      `db:"picked_from_location_id"`
	Status               string    `db:"status"` // PENDING, VALIDATED, DONE, BACKORDER, CANCELED
	CreatedAt            time.Time `db:"created_at"`
	UpdatedAt            time.Time `db:"updated_at"`
	OriginalSKU          *string   `db:"original_sku"`
	Price                *float64  `db:"price"`
	ReturnCondition      *string   `db:"return_condition"`
	ReturnNotes          *string   `db:"return_notes"`
	ConfirmedLocationID  *int      `db:"confirmed_location_id"`
	LastRecoveryAttempt  *string   `db:"last_recovery_attempt"`
}
