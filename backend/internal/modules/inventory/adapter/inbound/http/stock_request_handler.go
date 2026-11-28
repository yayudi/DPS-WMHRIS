package http

import (
	"fmt"
	"net/http"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// StockRequestHandler exposes HTTP endpoints for creating, approving, rejecting, dispatching, and completing stock requests.
type StockRequestHandler struct {
	stockRequestService inventory_port.StockRequestUseCase
}

// NewStockRequestHandler creates a new StockRequestHandler.
func NewStockRequestHandler(stockRequestService inventory_port.StockRequestUseCase) *StockRequestHandler {
	return &StockRequestHandler{stockRequestService: stockRequestService}
}

// Create creates a new stock transfer or stock opname request.
func (h *StockRequestHandler) Create(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.CreateStockRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	request, err := h.stockRequestService.CreateStockRequest(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "wms.stock_request.create_success", request)
}

// GetAll returns all stock requests with requester, location, and line-item details.
func (h *StockRequestHandler) GetAll(c *gin.Context) {
	requests, err := h.stockRequestService.GetAllStockRequests(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, requests)
}

// Approve approves a pending stock request (or executes and completes stock opname immediately).
func (h *StockRequestHandler) Approve(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	roleID := middleware.GetRoleID(c)

	if err := h.stockRequestService.ApproveStockRequest(c.Request.Context(), id, userID, roleID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.approve_success", nil)
}

// Reject rejects a pending stock request.
func (h *StockRequestHandler) Reject(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	roleID := middleware.GetRoleID(c)

	if err := h.stockRequestService.RejectStockRequest(c.Request.Context(), id, userID, roleID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.reject_success", nil)
}

// Dispatch deducts stock from the origin location and marks an approved transfer request as SHIPPED.
func (h *StockRequestHandler) Dispatch(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	roleID := middleware.GetRoleID(c)

	if err := h.stockRequestService.DispatchStockRequest(c.Request.Context(), id, userID, roleID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.dispatch_success", nil)
}

// Complete receives shipped items at the destination location and marks the request as COMPLETED.
func (h *StockRequestHandler) Complete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.CompleteStockRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	roleID := middleware.GetRoleID(c)

	if err := h.stockRequestService.CompleteStockRequest(c.Request.Context(), id, req, userID, roleID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.fulfill_success", nil)
}

// BulkAction approves or rejects multiple pending stock requests in a single batch call.
func (h *StockRequestHandler) BulkAction(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.BulkActionStockRequest](c)
	if !ok {
		return
	}
	req := *reqPtr
	roleID := middleware.GetRoleID(c)

	res, err := h.stockRequestService.BulkActionStockRequest(c.Request.Context(), req, userID, roleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("Memproses %d permintaan.", len(req.RequestIds)),
		"data":    res,
	})
}
