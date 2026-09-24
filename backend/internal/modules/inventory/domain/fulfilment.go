package domain

import "time"

// FulfilmentList represents the fulfilment_lists table
type FulfilmentList struct {
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
	InvoiceNo         *string    `db:"invoice_no"`
	Courier           *string    `db:"courier"`
	ExpeditionID      *int       `db:"expedition_id"`
	AWB               *string    `db:"awb"`
	KeljaHistories    *string    `db:"kelja_histories"`
}

// FulfilmentListItem represents the fulfilment_list_items table
type FulfilmentListItem struct {
	ID                   int       `db:"id"`
	FulfilmentListID        int       `db:"fulfilment_list_id"`
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
