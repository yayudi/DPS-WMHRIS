package http

import (
	"net/http"
	"strconv"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type ShiftHandler struct {
	shiftUseCase hris_port.ShiftUseCase
}

func NewShiftHandler(shiftUseCase hris_port.ShiftUseCase) *ShiftHandler {
	return &ShiftHandler{shiftUseCase: shiftUseCase}
}

func (h *ShiftHandler) GetAll(c *gin.Context) {
	shifts, err := h.shiftUseCase.GetAll(c.Request.Context())
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

	shift, err := h.shiftUseCase.GetByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Shift not found", "NOT_FOUND")
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, shift)
}

func (h *ShiftHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[hris_dto.CreateShiftRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	id, err := h.shiftUseCase.Create(c.Request.Context(), req)
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

	req_ptr, ok := utils.BindAndValidate[hris_dto.UpdateShiftRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err = h.shiftUseCase.Update(c.Request.Context(), id, req)
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

	err = h.shiftUseCase.Delete(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "SERVICE_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Shift deleted", nil)
}
