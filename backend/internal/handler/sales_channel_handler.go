package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type SalesChannelHandler struct {
	salesChannelService service.SalesChannelService
}

func NewSalesChannelHandler(salesChannelService service.SalesChannelService) *SalesChannelHandler {
	return &SalesChannelHandler{salesChannelService: salesChannelService}
}

func (h *SalesChannelHandler) GetAllChannels(c *gin.Context) {
	activeOnly := c.Query("activeOnly") == "true"
	data, err := h.salesChannelService.GetAllChannels(c.Request.Context(), activeOnly)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal mengambil data sales channels", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *SalesChannelHandler) GetChannelByID(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	data, err := h.salesChannelService.GetChannelByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Sales channel tidak ditemukan", "NOT_FOUND")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *SalesChannelHandler) CreateChannel(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateSalesChannelRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	id, err := h.salesChannelService.CreateChannel(c.Request.Context(), req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menambahkan sales channel", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.RawResponse(c, http.StatusCreated, gin.H{
		"success": true,
		"message": "Saluran penjualan berhasil ditambahkan.",
		"data":    gin.H{"id": id},
	})
}

func (h *SalesChannelHandler) UpdateChannel(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	req_ptr, ok := utils.BindAndValidate[dto.UpdateSalesChannelRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.salesChannelService.UpdateChannel(c.Request.Context(), id, req, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal memperbarui sales channel", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Saluran penjualan berhasil diperbarui.", nil)
}

func (h *SalesChannelHandler) DeleteChannel(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID := c.GetInt("userID")
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.salesChannelService.DeleteChannel(c.Request.Context(), id, userID, ip, userAgent)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menghapus sales channel", "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Saluran penjualan berhasil dihapus.", nil)
}
