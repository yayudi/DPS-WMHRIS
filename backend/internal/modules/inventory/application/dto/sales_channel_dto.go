package inventory_dto

type CreateSalesChannelRequest struct {
	Platform    string `json:"platform" binding:"required"`
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	IsActive    *bool  `json:"isActive"`
}

type UpdateSalesChannelRequest struct {
	Platform    string `json:"platform" binding:"required"`
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	IsActive    *bool  `json:"isActive"`
}

type SalesChannelResponse struct {
	ID          int     `json:"id" db:"id"`
	Platform    string  `json:"platform" db:"platform"`
	Name        string  `json:"name" db:"name"`
	Description *string `json:"description" db:"description"`
	IsActive    bool    `json:"is_active" db:"is_active"`
	CreatedAt   string  `json:"created_at" db:"created_at"`
	UpdatedAt   string  `json:"updated_at" db:"updated_at"`
}
