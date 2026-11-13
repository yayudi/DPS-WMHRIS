package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"net/http"

	"github.com/dps-wmhris/backend/internal/shared/utils"

	"github.com/gin-gonic/gin"
)

type LocationHandler struct {
	locationService inventory_port.LocationUseCase
}

func NewLocationHandler(locationService inventory_port.LocationUseCase) *LocationHandler {
	return &LocationHandler{locationService: locationService}
}

func (h *LocationHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.CreateLocationRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	location, err := h.locationService.CreateLocation(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.location.create_success", location)
}

func (h *LocationHandler) GetAll(c *gin.Context) {
	locations, err := h.locationService.GetAllLocations(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, locations)
}

func (h *LocationHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[inventory_dto.UpdateLocationRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.locationService.UpdateLocation(c.Request.Context(), userID, id, req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.location.update_success", nil)
}

func (h *LocationHandler) Delete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.locationService.DeleteLocation(c.Request.Context(), userID, id); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.location.delete_success", nil)
}

func (h *LocationHandler) GetStockSample(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	results, err := h.locationService.GetStockSample(c.Request.Context(), id)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

func (h *LocationHandler) ToggleFulfillmentSource(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	var req struct {
		IsFulfillmentSource bool `json:"is_fulfillment_source"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_REQUEST")
		return
	}

	if err := h.locationService.ToggleFulfillmentSource(c.Request.Context(), userID, id, req.IsFulfillmentSource); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.location.fulfillment_source_updated", nil)
}
