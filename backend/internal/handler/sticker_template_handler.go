package handler

import (
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type StickerTemplateHandler struct {
	stickerTemplateService service.StickerTemplateService
}

func NewStickerTemplateHandler(stickerTemplateService service.StickerTemplateService) *StickerTemplateHandler {
	return &StickerTemplateHandler{stickerTemplateService: stickerTemplateService}
}

func (h *StickerTemplateHandler) GetAllStickerTemplates(c *gin.Context) {
	data, err := h.stickerTemplateService.GetAllStickerTemplates(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data sticker templates", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StickerTemplateHandler) GetStickerTemplateByID(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	data, err := h.stickerTemplateService.GetStickerTemplateByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Sticker template tidak ditemukan", "NOT_FOUND")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StickerTemplateHandler) CreateStickerTemplate(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateStickerTemplateRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	id, err := h.stickerTemplateService.CreateStickerTemplate(c.Request.Context(), req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menambahkan sticker template", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusCreated, gin.H{
		"success": true,
		"message": "Sticker template berhasil ditambahkan.",
		"data":    gin.H{"id": id},
	})
}

func (h *StickerTemplateHandler) UpdateStickerTemplate(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	req_ptr, ok := utils.BindAndValidate[dto.UpdateStickerTemplateRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.stickerTemplateService.UpdateStickerTemplate(c.Request.Context(), id, req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memperbarui sticker template", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Sticker template berhasil diperbarui.", nil)
}

func (h *StickerTemplateHandler) DeleteStickerTemplate(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.stickerTemplateService.DeleteStickerTemplate(c.Request.Context(), id, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menghapus sticker template", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Sticker template berhasil dihapus.", nil)
}
