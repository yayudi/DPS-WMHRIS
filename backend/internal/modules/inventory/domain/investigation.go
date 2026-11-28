package domain

import "time"

// RevertableMovement holds the stock_movements fields required to safely reverse a movement inside a transaction.
type RevertableMovement struct {
	ID             int     `db:"id"`
	ProductID      int     `db:"product_id"`
	Quantity       int     `db:"quantity"`
	FromLocationID *int    `db:"from_location_id"`
	ToLocationID   *int    `db:"to_location_id"`
	MovementType   string  `db:"movement_type"`
	Notes          *string `db:"notes"`
}

// DuplicateTransactionItem represents one movement row belonging to a duplicate transaction group.
type DuplicateTransactionItem struct {
	ID               int       `db:"id" json:"id"`
	ProductID        int       `db:"product_id" json:"productId"`
	Quantity         int       `db:"quantity" json:"quantity"`
	FromLocationID   *int      `db:"from_location_id" json:"fromLocationId"`
	FromLocationCode *string   `db:"from_location_code" json:"fromLocationCode"`
	ToLocationID     *int      `db:"to_location_id" json:"toLocationId"`
	ToLocationCode   *string   `db:"to_location_code" json:"toLocationCode"`
	MovementType     string    `db:"movement_type" json:"movementType"`
	UserID           int       `db:"user_id" json:"userId"`
	Username         *string   `db:"username" json:"username"`
	Notes            *string   `db:"notes" json:"notes"`
	CreatedAt        time.Time `db:"created_at" json:"createdAt"`
	SKU              string    `db:"sku" json:"sku"`
	ProductName      string    `db:"product_name" json:"productName"`
}

// DuplicateGroup aggregates repeated stock movements sharing a normalized base note and movement type.
type DuplicateGroup struct {
	BaseNote         string                     `json:"baseNote"`
	MovementType     string                     `json:"movementType"`
	ExtractedInvoice *string                    `json:"extractedInvoice"`
	FulfilmentList   *FulfilmentListDetail      `json:"fulfilmentList"`
	TotalQuantity    int                        `json:"totalQuantity"`
	TotalTransaction int                        `json:"totalTransaction"`
	UniqueItemsCount int                        `json:"uniqueItemsCount"`
	Occurrences      int                        `json:"occurrences"`
	Transactions     []DuplicateTransactionItem `json:"transactions"`
}

// DuplicateTransactionsMeta contains pagination metadata for duplicate investigation queries.
type DuplicateTransactionsMeta struct {
	TotalGroups int `json:"totalGroups"`
	Page        int `json:"page"`
	Limit       int `json:"limit"`
	TotalPages  int `json:"totalPages"`
}

// DuplicateTransactionsResponse is the typed payload returned by InvestigationUseCase.GetDuplicateTransactions.
type DuplicateTransactionsResponse struct {
	Data []*DuplicateGroup         `json:"data"`
	Meta DuplicateTransactionsMeta `json:"meta"`
}

// FulfilmentListDetail describes legacy fulfilment list metadata linked to an investigated duplicate group.
type FulfilmentListDetail struct {
	ID                int                        `json:"id"`
	OriginalInvoiceID string                     `json:"originalInvoiceId"`
	CustomerName      string                     `json:"customerName"`
	Source            string                     `json:"source"`
	OrderDate         time.Time                  `json:"orderDate"`
	Status            string                     `json:"status"`
	MarketplaceStatus *string                    `json:"marketplaceStatus"`
	ShopName          *string                    `json:"shopName"`
	Items             []FulfilmentListDetailItem `json:"items"`
}

// FulfilmentListDetailItem describes one line item inside FulfilmentListDetail.
type FulfilmentListDetailItem struct {
	ItemID      int     `json:"itemId"`
	ProductID   int     `json:"productId"`
	OriginalSKU string  `json:"originalSku"`
	ProductName string  `json:"productName"`
	Quantity    int     `json:"quantity"`
	Price       float64 `json:"price"`
	Status      string  `json:"status"`
}
