package http

import (
	"net/http"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type CategoryHandler struct {
	categoryService catalog_port.CategoryUseCase
}

func NewCategoryHandler(categoryService catalog_port.CategoryUseCase) *CategoryHandler {
	return &CategoryHandler{categoryService: categoryService}
}

func (h *CategoryHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[catalog_dto.CreateCategoryRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	category, err := h.categoryService.CreateCategory(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.category.create_success", category)
}

func (h *CategoryHandler) GetAllActive(c *gin.Context) {
	status := c.DefaultQuery("status", "active")
	categories, err := h.categoryService.GetCategories(c.Request.Context(), status)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, categories)
}

func (h *CategoryHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[catalog_dto.UpdateCategoryRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.categoryService.UpdateCategory(c.Request.Context(), id, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.category.update_success", nil)
}

func (h *CategoryHandler) Delete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	err := h.categoryService.DeleteCategory(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.category.delete_success", nil)
}

func (h *CategoryHandler) Restore(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	err := h.categoryService.RestoreCategory(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "common.status.success", nil)
}
