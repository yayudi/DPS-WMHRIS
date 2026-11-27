package http

import (
	"log"
	"net/http"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/misc/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// StickerTemplateHandler handles HTTP endpoints for sticker template CRUD operations.
type StickerTemplateHandler struct {
	stickerTemplateService port.StickerTemplateUseCase
}

// NewStickerTemplateHandler constructs a StickerTemplateHandler with the given StickerTemplateUseCase.
func NewStickerTemplateHandler(stickerTemplateService port.StickerTemplateUseCase) *StickerTemplateHandler {
	return &StickerTemplateHandler{stickerTemplateService: stickerTemplateService}
}

// GetAllStickerTemplates returns all active sticker templates.
func (h *StickerTemplateHandler) GetAllStickerTemplates(c *gin.Context) {
	data, err := h.stickerTemplateService.GetAllStickerTemplates(c.Request.Context())
	if err != nil {
		log.Printf("[ERROR] GetAllStickerTemplates: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.sticker_template.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetStickerTemplateByID returns a single sticker template by ID.
func (h *StickerTemplateHandler) GetStickerTemplateByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	data, err := h.stickerTemplateService.GetStickerTemplateByID(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// CreateStickerTemplate creates a new sticker template.
func (h *StickerTemplateHandler) CreateStickerTemplate(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[misc_dto.CreateStickerTemplateRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	id, err := h.stickerTemplateService.CreateStickerTemplate(c.Request.Context(), req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.sticker_template.create_success", gin.H{"id": id})
}

// UpdateStickerTemplate updates an existing sticker template by ID.
func (h *StickerTemplateHandler) UpdateStickerTemplate(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	reqPtr, ok := utils.BindAndValidate[misc_dto.UpdateStickerTemplateRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	err := h.stickerTemplateService.UpdateStickerTemplate(c.Request.Context(), id, req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.sticker_template.update_success", nil)
}

// DeleteStickerTemplate deletes a sticker template by ID.
func (h *StickerTemplateHandler) DeleteStickerTemplate(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	err := h.stickerTemplateService.DeleteStickerTemplate(c.Request.Context(), id, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.sticker_template.delete_success", nil)
}
