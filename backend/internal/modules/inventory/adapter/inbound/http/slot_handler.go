package http

import (
	"net/http"
	"strconv"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// SlotHandler handles HTTP requests for locational metadata slotting and Kelja picking resolution.
type SlotHandler struct {
	slotService inventory_port.SlotUseCase
}

// NewSlotHandler creates a new instance of SlotHandler.
func NewSlotHandler(slotService inventory_port.SlotUseCase) *SlotHandler {
	return &SlotHandler{slotService: slotService}
}

// AddSlot handles adding a new slotting coordinate for a product.
func (h *SlotHandler) AddSlot(c *gin.Context) {
	reqPtr, ok := utils.BindAndValidate[inventory_dto.UpsertSlotRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "UNAUTHORIZED")
		return
	}

	slot, err := h.slotService.AddSlot(c.Request.Context(), userID, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "ADD_SLOT_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Koordinat ambalan berhasil ditambahkan", slot)
}

// GetSlots retrieves all active slotting coordinates for a given product and location.
func (h *SlotHandler) GetSlots(c *gin.Context) {
	productID, err := strconv.Atoi(c.Query("product_id"))
	if err != nil || productID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter product_id wajib diisi", "INVALID_PRODUCT_ID")
		return
	}

	locationID, err := strconv.Atoi(c.Query("location_id"))
	if err != nil || locationID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter location_id wajib diisi", "INVALID_LOCATION_ID")
		return
	}

	slots, err := h.slotService.GetSlots(c.Request.Context(), productID, locationID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "GET_SLOTS_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengambil data koordinat ambalan", slots)
}

// DeleteSlot handles removing a specific slot coordinate.
func (h *SlotHandler) DeleteSlot(c *gin.Context) {
	slotID, err := strconv.Atoi(c.Param("id"))
	if err != nil || slotID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter id wajib diisi", "INVALID_SLOT_ID")
		return
	}

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "UNAUTHORIZED")
		return
	}

	var req inventory_dto.DeleteSlotRequest
	_ = c.ShouldBindJSON(&req)

	if err := h.slotService.DeleteSlot(c.Request.Context(), userID, slotID, req.Notes); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "DELETE_SLOT_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Koordinat ambalan berhasil dihapus", nil)
}

// SetPrimarySlot sets a slot as the primary coordinate for picking.
func (h *SlotHandler) SetPrimarySlot(c *gin.Context) {
	slotID, err := strconv.Atoi(c.Param("id"))
	if err != nil || slotID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter id wajib diisi", "INVALID_SLOT_ID")
		return
	}

	productID, err := strconv.Atoi(c.Query("product_id"))
	if err != nil || productID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter product_id wajib diisi", "INVALID_PRODUCT_ID")
		return
	}

	locationID, err := strconv.Atoi(c.Query("location_id"))
	if err != nil || locationID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter location_id wajib diisi", "INVALID_LOCATION_ID")
		return
	}

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "UNAUTHORIZED")
		return
	}

	if err := h.slotService.SetPrimarySlot(c.Request.Context(), userID, productID, locationID, slotID); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "SET_PRIMARY_SLOT_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Rak utama berhasil diperbarui", nil)
}

// GetSlotLogs retrieves paginated audit logs for slotting movements.
func (h *SlotHandler) GetSlotLogs(c *gin.Context) {
	productID, err := strconv.Atoi(c.Query("product_id"))
	if err != nil || productID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter product_id wajib diisi", "INVALID_PRODUCT_ID")
		return
	}

	locationID, err := strconv.Atoi(c.Query("location_id"))
	if err != nil || locationID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter location_id wajib diisi", "INVALID_LOCATION_ID")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	logs, err := h.slotService.GetSlotLogs(c.Request.Context(), productID, locationID, page, limit)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "GET_SLOT_LOGS_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengambil riwayat perpindahan ambalan", logs)
}

// GetPickingLocationsForKelja resolves order picking guidance locations and slots for Kelja ERP.
func (h *SlotHandler) GetPickingLocationsForKelja(c *gin.Context) {
	referenceID := c.Param("reference_id")
	if referenceID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Parameter reference_id wajib diisi", "INVALID_REFERENCE_ID")
		return
	}

	res, err := h.slotService.GetPickingLocationsForKelja(c.Request.Context(), referenceID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, err.Error(), "PICKING_LOCATIONS_NOT_FOUND")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Lokasi picking berhasil ditemukan", res)
}
