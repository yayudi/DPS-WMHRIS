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

type StockRequestHandler struct {
	stockRequestService inventory_port.StockRequestUseCase
}

func NewStockRequestHandler(stockRequestService inventory_port.StockRequestUseCase) *StockRequestHandler {
	return &StockRequestHandler{stockRequestService: stockRequestService}
}

func (h *StockRequestHandler) Create(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.CreateStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	request, err := h.stockRequestService.CreateStockRequest(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "wms.stock_request.create_success", request)
}

func (h *StockRequestHandler) GetAll(c *gin.Context) {
	requests, err := h.stockRequestService.GetAllStockRequests(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, requests)
}

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

	err := h.stockRequestService.ApproveStockRequest(c.Request.Context(), id, userID, roleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.approve_success", nil)
}

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

	err := h.stockRequestService.RejectStockRequest(c.Request.Context(), id, userID, roleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.reject_success", nil)
}

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

	err := h.stockRequestService.DispatchStockRequest(c.Request.Context(), id, userID, roleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.dispatch_success", nil)
}

func (h *StockRequestHandler) Complete(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[inventory_dto.CompleteStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
	roleID := middleware.GetRoleID(c)

	err := h.stockRequestService.CompleteStockRequest(c.Request.Context(), id, req, userID, roleID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.stock_request.fulfill_success", nil)
}

func (h *StockRequestHandler) BulkAction(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.BulkActionStockRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}
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
