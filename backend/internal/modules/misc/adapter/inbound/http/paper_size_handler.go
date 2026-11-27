// Package http implements Gin HTTP inbound adapters for the misc module.
package http

import (
	"log"
	"net/http"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/misc/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// PaperSizeHandler handles HTTP endpoints for paper size preset CRUD operations.
type PaperSizeHandler struct {
	paperSizeService port.PaperSizeUseCase
}

// NewPaperSizeHandler constructs a PaperSizeHandler with the given PaperSizeUseCase.
func NewPaperSizeHandler(paperSizeService port.PaperSizeUseCase) *PaperSizeHandler {
	return &PaperSizeHandler{paperSizeService: paperSizeService}
}

// GetAllPaperSizes returns all active paper size presets.
func (h *PaperSizeHandler) GetAllPaperSizes(c *gin.Context) {
	data, err := h.paperSizeService.GetAllPaperSizes(c.Request.Context())
	if err != nil {
		log.Printf("[ERROR] GetAllPaperSizes: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.paper_size.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetPaperSizeByID returns a single paper size preset by ID.
func (h *PaperSizeHandler) GetPaperSizeByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	data, err := h.paperSizeService.GetPaperSizeByID(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// CreatePaperSize creates a new paper size preset.
func (h *PaperSizeHandler) CreatePaperSize(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[misc_dto.CreatePaperSizeRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	id, err := h.paperSizeService.CreatePaperSize(c.Request.Context(), req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.paper_size.create_success", gin.H{"id": id})
}

// UpdatePaperSize updates an existing paper size preset by ID.
func (h *PaperSizeHandler) UpdatePaperSize(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	reqPtr, ok := utils.BindAndValidate[misc_dto.UpdatePaperSizeRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	err := h.paperSizeService.UpdatePaperSize(c.Request.Context(), id, req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.paper_size.update_success", nil)
}

// DeletePaperSize deletes a paper size preset by ID.
func (h *PaperSizeHandler) DeletePaperSize(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	err := h.paperSizeService.DeletePaperSize(c.Request.Context(), id, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.paper_size.delete_success", nil)
}
