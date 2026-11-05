package domain

// SuggestedReplenishmentSource represents a storage rack with available stock for manual replenishment.
type SuggestedReplenishmentSource struct {
	LocationID        int    `json:"location_id"`
	LocationCode      string `json:"location_code"`
	Building          string `json:"building"`
	Purpose           string `json:"purpose"`
	AvailableQuantity int    `json:"available_quantity"`
}

// ReplenishmentDeficit details a single product deficit requiring manual movement from STORAGE to DISPLAY.
type ReplenishmentDeficit struct {
	ProductID                uint                           `json:"product_id"`
	SKU                      string                         `json:"sku,omitempty"`
	ProductName              string                         `json:"product_name,omitempty"`
	TargetQuantity           int                            `json:"target_quantity"`
	DisplayAvailableQuantity int                            `json:"display_available_quantity"`
	DeficitQuantity          int                            `json:"deficit_quantity"`
	SuggestedSources         []SuggestedReplenishmentSource `json:"suggested_sources"`
}

// OnHoldFulfillmentSummary summarizes a held transaction with its deficit details for the warehouse operator UI.
type OnHoldFulfillmentSummary struct {
	TransactionID    uint                   `json:"transaction_id"`
	TransactionNo    string                 `json:"transaction_no"`
	ReferenceType    string                 `json:"reference_type"`
	ReferenceID      string                 `json:"reference_id"`
	AssignedBuilding string                 `json:"assigned_building"`
	Status           string                 `json:"status"`
	Notes            *string                `json:"notes,omitempty"`
	CreatedAt        string                 `json:"created_at"`
	Deficits         []ReplenishmentDeficit `json:"deficits"`
}
