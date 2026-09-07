package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"

	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type LocationHandler struct {
	locationService service.LocationService
}

func NewLocationHandler(locationService service.LocationService) *LocationHandler {
	return &LocationHandler{locationService: locationService}
}

func (h *LocationHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateLocationRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
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
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[dto.UpdateLocationRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
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
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	userID := getUserID(c)
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
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", "")
		return
	}

	results, err := h.locationService.GetStockSample(c.Request.Context(), id)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, results)
}
