package http

import (
	"net/http"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// ShiftHandler exposes HTTP CRUD endpoints for HRIS work shift definitions.
type ShiftHandler struct {
	shiftUseCase hris_port.ShiftUseCase
}

// NewShiftHandler creates a new ShiftHandler.
func NewShiftHandler(shiftUseCase hris_port.ShiftUseCase) *ShiftHandler {
	return &ShiftHandler{shiftUseCase: shiftUseCase}
}

// GetAll returns all configured work shifts.
func (h *ShiftHandler) GetAll(c *gin.Context) {
	shifts, err := h.shiftUseCase.GetAll(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, shifts)
}

// GetByID returns a single work shift by its numeric ID.
func (h *ShiftHandler) GetByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	shift, err := h.shiftUseCase.GetByID(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	utils.SuccessDataResponse(c, http.StatusOK, shift)
}

// Create creates a new work shift definition.
func (h *ShiftHandler) Create(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[hris_dto.CreateShiftRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	id, err := h.shiftUseCase.Create(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "hris.shift.create_success", gin.H{"id": id})
}

// Update modifies an existing work shift definition by ID.
func (h *ShiftHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[hris_dto.UpdateShiftRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.shiftUseCase.Update(c.Request.Context(), id, req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "hris.shift.update_success", nil)
}

// Delete removes a non-default work shift definition by ID.
func (h *ShiftHandler) Delete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	if err := h.shiftUseCase.Delete(c.Request.Context(), id); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "hris.shift.delete_success", nil)
}
