package dto

import "time"

// ==========================================
// REQUEST DTOs
// ==========================================
// CompletePickingItem represents an individual item being picked
type CompletePickingItem struct {
	ID            int `json:"id" validate:"required"`
	PickingListID int `json:"picking_list_id" validate:"required"`
}

// CompletePickingRequest represents the payload from frontend
type CompletePickingRequest struct {
	Items []CompletePickingItem `json:"items" validate:"required,min=1"`
}

type RetryBackordersBatchRequest struct {
	PickingListIDs []int `json:"pickingListIds"`
}

// ==========================================
// RESPONSE DTOs
// ==========================================
type PendingPickingItemResponse struct {
	ID                 int        `json:"id" db:"id"`
	PickingListID      int        `json:"picking_list_id" db:"picking_list_id"`
	ProductID          int        `json:"product_id" db:"product_id"`
	SKU                string     `json:"sku" db:"sku"`
	Quantity           int        `json:"quantity" db:"quantity"`
	Status             string     `json:"status" db:"status"`
	LocationCode       *string    `json:"location_code" db:"location_code"`
	ProductName        *string    `json:"product_name" db:"product_name"`
	OriginalInvoiceID  *string    `json:"original_invoice_id" db:"original_invoice_id"`
	Source             *string    `json:"source" db:"source"`
	OrderDate          *time.Time `json:"order_date" db:"order_date"`
	CreatedAt          *time.Time `json:"created_at" db:"created_at"`
	CustomerName       *string    `json:"customer_name" db:"customer_name"`
	MarketplaceStatus  *string    `json:"marketplace_status" db:"marketplace_status"`
	LocationPurpose    *string    `json:"location_purpose" db:"location_purpose"`
	ShopName           *string    `json:"shop_name" db:"shop_name"`
	AvailableStock     int        `json:"available_stock" db:"available_stock"`
}

type HistoryPickingItemResponse struct {
	PickingListID      int        `json:"picking_list_id" db:"picking_list_id"`
	OriginalInvoiceID  *string    `json:"original_invoice_id" db:"original_invoice_id"`
	Source             *string    `json:"source" db:"source"`
	Status             string     `json:"status" db:"status"`
	MarketplaceStatus  *string    `json:"marketplace_status" db:"marketplace_status"`
	CustomerName       *string    `json:"customer_name" db:"customer_name"`
	ShopName           *string    `json:"shop_name" db:"shop_name"`
	CreatedAt          *time.Time `json:"created_at" db:"created_at"`
	OrderDate          *time.Time `json:"order_date" db:"order_date"`
	LocationPurpose    *string    `json:"location_purpose" db:"location_purpose"`
	ItemID             int        `json:"item_id" db:"item_id"`
	SKU                string     `json:"sku" db:"sku"`
	Quantity           int        `json:"quantity" db:"quantity"`
	ItemStatus         string     `json:"item_status" db:"item_status"`
	ReturnCondition    *string    `json:"return_condition" db:"return_condition"`
	ReturnNotes        *string    `json:"return_notes" db:"return_notes"`
	ProductName        *string    `json:"product_name" db:"product_name"`
}

type PickingListDetailResponse struct {
	ID              int     `json:"id" db:"id"`
	SKU             string  `json:"sku" db:"sku"`
	Quantity        int     `json:"qty" db:"qty"`
	Name            *string `json:"name" db:"name"`
	Status          string  `json:"status" db:"status"`
	ReturnCondition *string `json:"return_condition" db:"return_condition"`
	ReturnNotes     *string `json:"return_notes" db:"return_notes"`
}
