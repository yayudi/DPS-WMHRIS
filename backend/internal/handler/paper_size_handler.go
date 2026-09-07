package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"log"
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type PaperSizeHandler struct {
	paperSizeService service.PaperSizeService
}

func NewPaperSizeHandler(paperSizeService service.PaperSizeService) *PaperSizeHandler {
	return &PaperSizeHandler{paperSizeService: paperSizeService}
}

func (h *PaperSizeHandler) GetAllPaperSizes(c *gin.Context) {
	data, err := h.paperSizeService.GetAllPaperSizes(c.Request.Context())
	if err != nil {
		log.Printf("[ERROR] GetAllPaperSizes: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data paper sizes", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *PaperSizeHandler) GetPaperSizeByID(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	data, err := h.paperSizeService.GetPaperSizeByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Paper size tidak ditemukan", "NOT_FOUND")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *PaperSizeHandler) CreatePaperSize(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreatePaperSizeRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	id, err := h.paperSizeService.CreatePaperSize(c.Request.Context(), req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menambahkan paper size", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusCreated, gin.H{
		"success": true,
		"message": "Paper size berhasil ditambahkan.",
		"data":    gin.H{"id": id},
	})
}

func (h *PaperSizeHandler) UpdatePaperSize(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	req_ptr, ok := utils.BindAndValidate[dto.UpdatePaperSizeRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.paperSizeService.UpdatePaperSize(c.Request.Context(), id, req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memperbarui paper size", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Paper size berhasil diperbarui.", nil)
}

func (h *PaperSizeHandler) DeletePaperSize(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.paperSizeService.DeletePaperSize(c.Request.Context(), id, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menghapus paper size", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Paper size berhasil dihapus.", nil)
}
