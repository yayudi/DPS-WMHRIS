package domain

import "time"

type ManualReturn struct {
	ID        int       `db:"id" json:"id"`
	UserID    int       `db:"user_id" json:"userId"`
	ProductID int       `db:"product_id" json:"productId"`
	Quantity  int       `db:"quantity" json:"quantity"`
	Condition string    `db:"condition" json:"condition"`
	Reference *string   `db:"reference" json:"reference"`
	Notes     *string   `db:"notes" json:"notes"`
	Status    string    `db:"status" json:"status"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
	UpdatedAt time.Time `db:"updated_at" json:"updatedAt"`
}

type MarketplaceReturnItem struct {
	Type         string    `db:"type" json:"type"` // Always "MARKETPLACE"
	ID           int       `db:"id" json:"id"`
	Reference    string    `db:"reference" json:"reference"` // from pl.original_invoice_id
	ProductName  string    `db:"product_name" json:"product_name"`
	SKU          string    `db:"sku" json:"sku"` // from pli.original_sku
	Quantity     int       `db:"quantity" json:"quantity"`
	Condition    *string   `db:"condition" json:"condition"`
	Notes        *string   `db:"notes" json:"notes"`
	LocationCode *string   `db:"location_code" json:"location_code"`
	Date         time.Time `db:"date" json:"date"`
	Source       string    `db:"source" json:"source"`
}

type ManualReturnItem struct {
	Type        string    `db:"type" json:"type"` // Always "MANUAL"
	ID          int       `db:"id" json:"id"`
	Reference   *string   `db:"reference" json:"reference"`
	ProductName string    `db:"product_name" json:"product_name"`
	SKU         string    `db:"sku" json:"sku"`
	Quantity    int       `db:"quantity" json:"quantity"`
	Condition   string    `db:"condition" json:"condition"`
	Notes       *string   `db:"notes" json:"notes"`
	Date        time.Time `db:"date" json:"date"`
	Source      string    `db:"source" json:"source"` // Always "MANUAL"
}
