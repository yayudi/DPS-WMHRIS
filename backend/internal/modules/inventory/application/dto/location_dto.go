package inventory_dto

type CreateLocationRequest struct {
	Code     string `json:"code" binding:"required"`
	Building string `json:"building" binding:"required"`
	Floor    *int   `json:"floor"`
	Name     string `json:"name"`
	Purpose  string `json:"purpose"`
	IsActive *bool  `json:"is_active" binding:"required"`
}

type UpdateLocationRequest struct {
	Code     string `json:"code" binding:"required"`
	Building string `json:"building" binding:"required"`
	Floor    *int   `json:"floor"`
	Name     string `json:"name"`
	Purpose  string `json:"purpose"`
	IsActive *bool  `json:"is_active" binding:"required"`
}

type StockSampleResponse struct {
	ProductID int     `json:"product_id" db:"product_id"`
	SKU       string  `json:"sku" db:"sku"`
	Name      string  `json:"name" db:"name"`
	Quantity  float64 `json:"quantity" db:"quantity"` // It might be float64 in old versions or int
}
