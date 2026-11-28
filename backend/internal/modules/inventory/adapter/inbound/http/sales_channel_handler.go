package http

import (
	"net/http"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// SalesChannelHandler exposes HTTP CRUD endpoints for sales channels.
type SalesChannelHandler struct {
	salesChannelService inventory_port.SalesChannelUseCase
}

// NewSalesChannelHandler creates a new SalesChannelHandler.
func NewSalesChannelHandler(salesChannelService inventory_port.SalesChannelUseCase) *SalesChannelHandler {
	return &SalesChannelHandler{salesChannelService: salesChannelService}
}

// GetAllChannels returns all sales channels, optionally filtered to active records only.
func (h *SalesChannelHandler) GetAllChannels(c *gin.Context) {
	activeOnly := c.Query("activeOnly") == "true"
	data, err := h.salesChannelService.GetAllChannels(c.Request.Context(), activeOnly)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetChannelByID returns a single sales channel by its numeric ID.
func (h *SalesChannelHandler) GetChannelByID(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}
	data, err := h.salesChannelService.GetChannelByID(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// CreateChannel creates a new sales channel.
func (h *SalesChannelHandler) CreateChannel(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.CreateSalesChannelRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	id, err := h.salesChannelService.CreateChannel(c.Request.Context(), req, userID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.sales_channel.create_success", gin.H{"id": id})
}

// UpdateChannel modifies an existing sales channel by ID.
func (h *SalesChannelHandler) UpdateChannel(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.UpdateSalesChannelRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.salesChannelService.UpdateChannel(c.Request.Context(), id, req, userID, c.ClientIP(), c.Request.UserAgent()); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.sales_channel.update_success", nil)
}

// DeleteChannel deletes a sales channel by ID.
func (h *SalesChannelHandler) DeleteChannel(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.salesChannelService.DeleteChannel(c.Request.Context(), id, userID, c.ClientIP(), c.Request.UserAgent()); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.sales_channel.delete_success", nil)
}
