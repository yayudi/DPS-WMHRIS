// Package catalog_dto defines request and response DTOs for the catalog module.
package catalog_dto

// CreateCategoryRequest defines the JSON payload for creating a product category.
type CreateCategoryRequest struct {
	Name     string `json:"name" binding:"required"`
	IsActive *bool  `json:"is_active" binding:"required"` // Pointer avoids zero-value bypass on false
}

// UpdateCategoryRequest defines the JSON payload for renaming a product category.
type UpdateCategoryRequest struct {
	Name string `json:"name" binding:"required"`
}
