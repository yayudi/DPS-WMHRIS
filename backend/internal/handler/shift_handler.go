package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type ShiftHandler struct {
	shiftService service.ShiftService
}

func NewShiftHandler(shiftService service.ShiftService) *ShiftHandler {
	return &ShiftHandler{shiftService: shiftService}
}

func (h *ShiftHandler) GetAll(c *gin.Context) {
	shifts, err := h.shiftService.GetAll(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_ERROR")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, shifts)
}

func (h *ShiftHandler) GetByID(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "VALIDATION_ERROR")
		return
	}

	shift, err := h.shiftService.GetByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Shift not found", "NOT_FOUND")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, shift)
}

func (h *ShiftHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateShiftRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	id, err := h.shiftService.Create(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "SERVICE_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusCreated, gin.H{"success": true, "message": "Shift created", "data": gin.H{"id": id}})
}

func (h *ShiftHandler) Update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "VALIDATION_ERROR")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.UpdateShiftRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err = h.shiftService.Update(c.Request.Context(), id, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "SERVICE_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Shift updated", nil)
}

func (h *ShiftHandler) Delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "VALIDATION_ERROR")
		return
	}

	err = h.shiftService.Delete(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "SERVICE_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Shift deleted", nil)
}
