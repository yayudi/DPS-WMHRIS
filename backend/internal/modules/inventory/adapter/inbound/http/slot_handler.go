package http

import (
	"net/http"
	"strconv"
	"strings"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
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

// AddSlot handles adding a new slotting coordinate for a product at a location.
func (h *SlotHandler) AddSlot(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.UpsertSlotRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	slot, err := h.slotService.AddSlot(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.slotting.create_success", slot)
}

// GetSlots retrieves all active slotting coordinates for a given product and location.
func (h *SlotHandler) GetSlots(c *gin.Context) {
	productID, err := strconv.Atoi(c.Query("product_id"))
	if err != nil || productID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_PRODUCT_ID")
		return
	}

	locationID, err := strconv.Atoi(c.Query("location_id"))
	if err != nil || locationID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_LOCATION_ID")
		return
	}

	slots, err := h.slotService.GetSlots(c.Request.Context(), productID, locationID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, slots)
}

// DeleteSlot handles removing a specific slot coordinate by ID.
func (h *SlotHandler) DeleteSlot(c *gin.Context) {
	slotID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	var req inventory_dto.DeleteSlotRequest
	_ = c.ShouldBindJSON(&req)

	if err := h.slotService.DeleteSlot(c.Request.Context(), userID, slotID, req.Notes); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.slotting.delete_success", nil)
}

// SetPrimarySlot designates a specific slot as the primary picking coordinate.
func (h *SlotHandler) SetPrimarySlot(c *gin.Context) {
	slotID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	productID, err := strconv.Atoi(c.Query("product_id"))
	if err != nil || productID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_PRODUCT_ID")
		return
	}

	locationID, err := strconv.Atoi(c.Query("location_id"))
	if err != nil || locationID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_LOCATION_ID")
		return
	}

	if err := h.slotService.SetPrimarySlot(c.Request.Context(), userID, productID, locationID, slotID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.slotting.set_primary_success", nil)
}

// GetSlotLogs retrieves paginated audit logs for slotting coordinate changes.
func (h *SlotHandler) GetSlotLogs(c *gin.Context) {
	productID, err := strconv.Atoi(c.Query("product_id"))
	if err != nil || productID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_PRODUCT_ID")
		return
	}

	locationID, err := strconv.Atoi(c.Query("location_id"))
	if err != nil || locationID <= 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_LOCATION_ID")
		return
	}

	page, limit := utils.ParsePagination(c, 20)

	logs, err := h.slotService.GetSlotLogs(c.Request.Context(), productID, locationID, page, limit)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, logs)
}

// GetPickingLocationsForKelja resolves order picking guidance locations and slots for Kelja ERP.
func (h *SlotHandler) GetPickingLocationsForKelja(c *gin.Context) {
	referenceID := strings.TrimSpace(c.Param("reference_id"))
	if referenceID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "wms.slotting.err_ref_required", "INVALID_REFERENCE_ID")
		return
	}

	res, err := h.slotService.GetPickingLocationsForKelja(c.Request.Context(), referenceID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.slotting.picking_location_found", res)
}
