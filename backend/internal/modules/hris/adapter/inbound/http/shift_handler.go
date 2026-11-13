package http

import (
	"net/http"

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
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, shifts)
}

func (h *ShiftHandler) GetByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	shift, err := h.shiftUseCase.GetByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "hris.shift.not_found", "NOT_FOUND")
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
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "hris.shift.create_success", gin.H{"id": id})
}

func (h *ShiftHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[hris_dto.UpdateShiftRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	err := h.shiftUseCase.Update(c.Request.Context(), id, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "hris.shift.update_success", nil)
}

func (h *ShiftHandler) Delete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	err := h.shiftUseCase.Delete(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "hris.shift.delete_success", nil)
}
