package catalog_dto

type CreateCategoryRequest struct {
	Name     string `json:"name" binding:"required"`
	IsActive *bool  `json:"is_active" binding:"required"` // Pointer untuk menghindari bypass validasi nilai nol (false)
}

type UpdateCategoryRequest struct {
	Name string `json:"name" binding:"required"`
}
