package inventory_dto

import "time"

// ==========================================
// REQUEST DTOs
// ==========================================
// CompleteFulfilmentItem represents an individual item being picked
type CompleteFulfilmentItem struct {
	ID            int `json:"id" validate:"required"`
	FulfilmentListID int `json:"fulfilment_list_id" validate:"required"`
}

// CompleteFulfilmentRequest represents the payload from frontend
// Action: "pick" | "pack" | "ship" | "force_complete" (default: "force_complete" for backward compat)
type CompleteFulfilmentRequest struct {
	Items  []CompleteFulfilmentItem `json:"items" validate:"required,min=1"`
	Action string                   `json:"action"`
}

type RetryBackordersBatchRequest struct {
	FulfilmentListIDs []int `json:"fulfilmentListIds"`
}

// PendingFulfilmentFilter represents query params for server-side filtering
type PendingFulfilmentFilter struct {
	Search          string
	SourceType      string // 'All', 'Online', 'Offline'
	SourceInclude   []string
	SourceExclude   []string
	ShopInclude          []string
	ShopExclude          []string
	ExpeditionIDInclude  []int
	ExpeditionIDExclude  []int
	IsSameday            *bool
	IsBackorder          *bool
	Role            string // 'All', 'Picker', 'Packer', 'Shipper'
	StartDate       string
	EndDate         string
	SortBy          string // 'newest', 'oldest'
	Page            int
	Limit           int
}

// ==========================================
// RESPONSE DTOs
// ==========================================
type ExpeditionOption struct {
	ID        int    `json:"id" db:"id"`
	Name      string `json:"name" db:"name"`
	IsSameday bool   `json:"is_sameday" db:"is_sameday"`
}

type PendingFilterOptionsResponse struct {
	Expeditions []ExpeditionOption `json:"expeditions"`
	Shops       []string           `json:"shops"`
}
type PendingFulfilmentItemResponse struct {
	ID                int        `json:"id" db:"id"`
	FulfilmentListID     int        `json:"fulfilment_list_id" db:"fulfilment_list_id"`
	ProductID         int        `json:"product_id" db:"product_id"`
	SKU               string     `json:"sku" db:"sku"`
	Quantity          int        `json:"quantity" db:"quantity"`
	Status            string     `json:"status" db:"status"`
	LocationCode      *string    `json:"location_code" db:"location_code"`
	ProductName       *string    `json:"product_name" db:"product_name"`
	OriginalInvoiceID *string    `json:"original_invoice_id" db:"original_invoice_id"`
	Source            *string    `json:"source" db:"source"`
	OrderDate         *time.Time `json:"order_date" db:"order_date"`
	CreatedAt         *time.Time `json:"created_at" db:"created_at"`
	CustomerName      *string    `json:"customer_name" db:"customer_name"`
	MarketplaceStatus *string    `json:"marketplace_status" db:"marketplace_status"`
	LocationPurpose   *string    `json:"location_purpose" db:"location_purpose"`
	ShopName          *string    `json:"shop_name" db:"shop_name"`
	InvoiceNo         *string    `json:"invoice_no" db:"invoice_no"`
	Courier           *string    `json:"courier" db:"courier"`
	ExpeditionID      *int       `json:"expedition_id" db:"expedition_id"`
	AWB               *string    `json:"awb" db:"awb"`
	KeljaHistories    *string    `json:"kelja_histories" db:"kelja_histories"`
	AvailableStock    int        `json:"available_stock" db:"available_stock"`
}

type HistoryFulfilmentItemResponse struct {
	FulfilmentListID     int        `json:"fulfilment_list_id" db:"fulfilment_list_id"`
	OriginalInvoiceID *string    `json:"original_invoice_id" db:"original_invoice_id"`
	Source            *string    `json:"source" db:"source"`
	Status            string     `json:"status" db:"status"`
	MarketplaceStatus *string    `json:"marketplace_status" db:"marketplace_status"`
	CustomerName      *string    `json:"customer_name" db:"customer_name"`
	ShopName          *string    `json:"shop_name" db:"shop_name"`
	InvoiceNo         *string    `json:"invoice_no" db:"invoice_no"`
	Courier           *string    `json:"courier" db:"courier"`
	ExpeditionID      *int       `json:"expedition_id" db:"expedition_id"`
	AWB               *string    `json:"awb" db:"awb"`
	KeljaHistories    *string    `json:"kelja_histories" db:"kelja_histories"`
	CreatedAt         *time.Time `json:"created_at" db:"created_at"`
	OrderDate         *time.Time `json:"order_date" db:"order_date"`
	LocationPurpose   *string    `json:"location_purpose" db:"location_purpose"`
	ItemID            int        `json:"item_id" db:"item_id"`
	SKU               string     `json:"sku" db:"sku"`
	Quantity          int        `json:"quantity" db:"quantity"`
	ItemStatus        string     `json:"item_status" db:"item_status"`
	ReturnCondition   *string    `json:"return_condition" db:"return_condition"`
	ReturnNotes       *string    `json:"return_notes" db:"return_notes"`
	ProductName       *string    `json:"product_name" db:"product_name"`
}

type FulfilmentListDetailResponse struct {
	ID              int     `json:"id" db:"id"`
	SKU             string  `json:"sku" db:"sku"`
	Quantity        int     `json:"qty" db:"qty"`
	Name            *string `json:"name" db:"name"`
	Status          string  `json:"status" db:"status"`
	ReturnCondition *string `json:"return_condition" db:"return_condition"`
	ReturnNotes     *string `json:"return_notes" db:"return_notes"`
}
