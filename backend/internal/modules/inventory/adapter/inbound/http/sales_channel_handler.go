package http

import (
	"net/http"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"

	inventory_usecase "github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type SalesChannelHandler struct {
	salesChannelService inventory_usecase.SalesChannelService
}

func NewSalesChannelHandler(salesChannelService inventory_usecase.SalesChannelService) *SalesChannelHandler {
	return &SalesChannelHandler{salesChannelService: salesChannelService}
}

func (h *SalesChannelHandler) GetAllChannels(c *gin.Context) {
	activeOnly := c.Query("activeOnly") == "true"
	data, err := h.salesChannelService.GetAllChannels(c.Request.Context(), activeOnly)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *SalesChannelHandler) GetChannelByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	data, err := h.salesChannelService.GetChannelByID(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "master_data.sales_channel.not_found", "NOT_FOUND")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *SalesChannelHandler) CreateChannel(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.CreateSalesChannelRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	id, err := h.salesChannelService.CreateChannel(c.Request.Context(), req, userID, ip, userAgent)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.sales_channel.create_success", gin.H{"id": id})
}

func (h *SalesChannelHandler) UpdateChannel(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	req_ptr, ok := utils.BindAndValidate[inventory_dto.UpdateSalesChannelRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.salesChannelService.UpdateChannel(c.Request.Context(), id, req, userID, ip, userAgent)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.sales_channel.update_success", nil)
}

func (h *SalesChannelHandler) DeleteChannel(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	userID := middleware.GetUserID(c)
	ip := c.ClientIP()
	userAgent := c.Request.UserAgent()

	err := h.salesChannelService.DeleteChannel(c.Request.Context(), id, userID, ip, userAgent)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.sales_channel.delete_success", nil)
}
