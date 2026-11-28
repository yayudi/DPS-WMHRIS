package inventory_dto

// CreateSalesChannelRequest defines the JSON payload for creating a sales channel.
type CreateSalesChannelRequest struct {
	Platform    string `json:"platform" binding:"required,oneof=Shopee Tokopedia Offline Lainnya"`
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	IsActive    *bool  `json:"isActive"`
}

// UpdateSalesChannelRequest defines the JSON payload for updating a sales channel.
type UpdateSalesChannelRequest struct {
	Platform    string `json:"platform" binding:"required,oneof=Shopee Tokopedia Offline Lainnya"`
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	IsActive    *bool  `json:"isActive"`
}

// SalesChannelResponse represents a sales channel record returned by the API.
type SalesChannelResponse struct {
	ID          int     `json:"id" db:"id"`
	Platform    string  `json:"platform" db:"platform"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description" db:"description"`
	IsActive    bool    `json:"is_active" db:"is_active"`
	CreatedAt   string  `json:"created_at" db:"created_at"`
	UpdatedAt   string  `json:"updated_at" db:"updated_at"`
}
