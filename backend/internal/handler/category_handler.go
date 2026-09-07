package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type CategoryHandler struct {
	categoryService service.CategoryService
}

func NewCategoryHandler(categoryService service.CategoryService) *CategoryHandler {
	return &CategoryHandler{categoryService: categoryService}
}

func (h *CategoryHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateCategoryRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	category, err := h.categoryService.CreateCategory(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Kategori berhasil dibuat", category)
}

func (h *CategoryHandler) GetAllActive(c *gin.Context) {
	categories, err := h.categoryService.GetActiveCategories(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengambil data kategori", categories)
}

func (h *CategoryHandler) Update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "VALIDATION_ERROR")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.UpdateCategoryRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err = h.categoryService.UpdateCategory(c.Request.Context(), id, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Kategori berhasil diupdate", nil)
}

func (h *CategoryHandler) Delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "VALIDATION_ERROR")
		return
	}

	err = h.categoryService.DeleteCategory(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Kategori berhasil dihapus", nil)
}
