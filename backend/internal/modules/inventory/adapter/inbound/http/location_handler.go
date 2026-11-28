// Package http implements Gin HTTP handlers for the inventory bounded context.
package http

import (
	"net/http"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// LocationHandler exposes HTTP endpoints for managing warehouse locations and fulfillment source flags.
type LocationHandler struct {
	locationService inventory_port.LocationUseCase
}

// NewLocationHandler creates a new LocationHandler.
func NewLocationHandler(locationService inventory_port.LocationUseCase) *LocationHandler {
	return &LocationHandler{locationService: locationService}
}

// Create creates a new warehouse location.
func (h *LocationHandler) Create(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.CreateLocationRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	location, err := h.locationService.CreateLocation(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "master_data.location.create_success", location)
}

// GetAll returns all non-deleted warehouse locations.
func (h *LocationHandler) GetAll(c *gin.Context) {
	locations, err := h.locationService.GetAllLocations(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, locations)
}

// Update modifies an existing warehouse location by ID.
func (h *LocationHandler) Update(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.UpdateLocationRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.locationService.UpdateLocation(c.Request.Context(), userID, id, req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.location.update_success", nil)
}

// Delete soft-deletes a warehouse location by ID.
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

// GetStockSample returns up to 10 top stocked products stored at a location.
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

// ToggleFulfillmentSource updates the automatic fulfillment source flag for a location.
func (h *LocationHandler) ToggleFulfillmentSource(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.ToggleFulfillmentSourceRequest](c)
	if !ok {
		return
	}

	if err := h.locationService.ToggleFulfillmentSource(c.Request.Context(), userID, id, *reqPtr.IsFulfillmentSource); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "master_data.location.fulfillment_source_updated", nil)
}
