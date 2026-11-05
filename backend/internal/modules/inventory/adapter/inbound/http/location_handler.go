package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"net/http"

	"github.com/dps-wmhris/backend/internal/shared/middleware"
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

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	location, err := h.locationService.CreateLocation(c.Request.Context(), userID, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Lokasi berhasil dibuat", location)
}

func (h *LocationHandler) GetAll(c *gin.Context) {
	locations, err := h.locationService.GetAllLocations(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "INTERNAL_SERVER_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengambil data lokasi", locations)
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

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	if err := h.locationService.UpdateLocation(c.Request.Context(), userID, id, req); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Lokasi berhasil diperbarui.", nil)
}

func (h *LocationHandler) Delete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	if err := h.locationService.DeleteLocation(c.Request.Context(), userID, id); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Lokasi berhasil dihapus.", nil)
}

func (h *LocationHandler) GetStockSample(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	results, err := h.locationService.GetStockSample(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}

func (h *LocationHandler) ToggleFulfillmentSource(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	var req struct {
		IsFulfillmentSource bool `json:"is_fulfillment_source"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Request body tidak valid", "INVALID_REQUEST")
		return
	}

	if err := h.locationService.ToggleFulfillmentSource(c.Request.Context(), userID, id, req.IsFulfillmentSource); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "TOGGLE_FULFILLMENT_SOURCE_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Status sumber fulfillment berhasil diubah", nil)
}
