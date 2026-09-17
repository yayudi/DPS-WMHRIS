package http

import (
	"net/http"
	"strconv"

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

	req_ptr, ok := utils.BindAndValidate[catalog_dto.UpdateCategoryRequest](c)
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

func getUserID(c *gin.Context) int {
	userID, _ := c.Get("user_id")
	if id, ok := userID.(int); ok {
		return id
	}
	return 0
}
