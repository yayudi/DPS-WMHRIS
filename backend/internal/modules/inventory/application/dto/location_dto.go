// Package inventory_dto defines request and response DTOs for the inventory module.
package inventory_dto

// CreateLocationRequest defines the JSON payload for creating a warehouse location.
type CreateLocationRequest struct {
	Code                string `json:"code" binding:"required"`
	Building            string `json:"building" binding:"required"`
	Floor               *int   `json:"floor"`
	Name                string `json:"name"`
	Purpose             string `json:"purpose"`
	IsActive            *bool  `json:"is_active" binding:"required"`
	IsFulfillmentSource *bool  `json:"is_fulfillment_source"`
}

// UpdateLocationRequest defines the JSON payload for updating an existing warehouse location.
type UpdateLocationRequest struct {
	Code                string `json:"code" binding:"required"`
	Building            string `json:"building" binding:"required"`
	Floor               *int   `json:"floor"`
	Name                string `json:"name"`
	Purpose             string `json:"purpose"`
	IsActive            *bool  `json:"is_active" binding:"required"`
	IsFulfillmentSource *bool  `json:"is_fulfillment_source"`
}

// ToggleFulfillmentSourceRequest defines the JSON payload for toggling a location's fulfillment source flag.
type ToggleFulfillmentSourceRequest struct {
	IsFulfillmentSource *bool `json:"is_fulfillment_source" binding:"required"`
}

// StockSampleResponse represents a top stocked product sample at a specific location.
type StockSampleResponse struct {
	ProductID int     `json:"product_id" db:"product_id"`
	SKU       string  `json:"sku" db:"sku"`
	Name      string  `json:"name" db:"name"`
	Quantity  float64 `json:"quantity" db:"quantity"`
}
