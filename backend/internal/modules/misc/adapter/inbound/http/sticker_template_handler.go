package http

import (
	"net/http"

	misc_dto "github.com/dps-wmhris/backend/internal/modules/misc/application/dto"

	misc_usecase "github.com/dps-wmhris/backend/internal/modules/misc/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type StickerTemplateHandler struct {
	stickerTemplateService misc_usecase.StickerTemplateService
}

func NewStickerTemplateHandler(stickerTemplateService misc_usecase.StickerTemplateService) *StickerTemplateHandler {
	return &StickerTemplateHandler{stickerTemplateService: stickerTemplateService}
}

func (h *StickerTemplateHandler) GetAllStickerTemplates(c *gin.Context) {
	data, err := h.stickerTemplateService.GetAllStickerTemplates(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.sticker_template.fetch_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StickerTemplateHandler) GetStickerTemplateByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	data, err := h.stickerTemplateService.GetStickerTemplateByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "settings.sticker_template.not_found", "NOT_FOUND")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StickerTemplateHandler) CreateStickerTemplate(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[misc_dto.CreateStickerTemplateRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	id, err := h.stickerTemplateService.CreateStickerTemplate(c.Request.Context(), req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.sticker_template.create_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "settings.sticker_template.create_success", gin.H{"id": id})
}

func (h *StickerTemplateHandler) UpdateStickerTemplate(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	req_ptr, ok := utils.BindAndValidate[misc_dto.UpdateStickerTemplateRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.stickerTemplateService.UpdateStickerTemplate(c.Request.Context(), id, req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.sticker_template.update_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.sticker_template.update_success", nil)
}

func (h *StickerTemplateHandler) DeleteStickerTemplate(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.stickerTemplateService.DeleteStickerTemplate(c.Request.Context(), id, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "settings.sticker_template.delete_failed", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "settings.sticker_template.delete_success", nil)
}
