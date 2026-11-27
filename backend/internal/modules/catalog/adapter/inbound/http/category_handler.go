// Package http implements Gin HTTP handlers for catalog categories, products, and packages.
package http

import (
	"net/http"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// CategoryHandler exposes HTTP endpoints for managing product categories.
type CategoryHandler struct {
	categoryService catalog_port.CategoryUseCase
}

// NewCategoryHandler creates a new CategoryHandler.
func NewCategoryHandler(categoryService catalog_port.CategoryUseCase) *CategoryHandler {
	return &CategoryHandler{categoryService: categoryService}
}

// Create creates a new product category.
func (h *CategoryHandler) Create(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[catalog_dto.CreateCategoryRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	category, err := h.categoryService.CreateCategory(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.category.create_success", category)
}

// GetAllActive returns categories filtered by status query parameter (default "active").
func (h *CategoryHandler) GetAllActive(c *gin.Context) {
	status := c.DefaultQuery("status", "active")
	categories, err := h.categoryService.GetCategories(c.Request.Context(), status)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, categories)
}

// Update renames an existing product category by ID.
func (h *CategoryHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[catalog_dto.UpdateCategoryRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.categoryService.UpdateCategory(c.Request.Context(), id, req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.category.update_success", nil)
}

// Delete archives (soft-deletes) a product category by ID.
func (h *CategoryHandler) Delete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	if err := h.categoryService.DeleteCategory(c.Request.Context(), id); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.category.delete_success", nil)
}

// Restore reactivates an archived product category by ID.
func (h *CategoryHandler) Restore(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	if err := h.categoryService.RestoreCategory(c.Request.Context(), id); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "common.status.success", nil)
}
