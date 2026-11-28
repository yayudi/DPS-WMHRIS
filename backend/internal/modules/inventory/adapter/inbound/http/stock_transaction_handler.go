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

// StockTransactionHandler exposes HTTP endpoints for fulfillment transaction creation, picking, holds, and release.
type StockTransactionHandler struct {
	trxService inventory_port.StockTransactionUseCase
}

// NewStockTransactionHandler creates a new StockTransactionHandler.
func NewStockTransactionHandler(trxService inventory_port.StockTransactionUseCase) *StockTransactionHandler {
	return &StockTransactionHandler{trxService: trxService}
}

// CreateTransaction creates a new fulfillment transaction with greedy display reservation or replenishment hold.
func (h *StockTransactionHandler) CreateTransaction(c *gin.Context) {
	if _, ok := utils.RequireUserID(c); !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.CreateTransactionRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	trx, err := h.trxService.CreateTransaction(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "wms.transaction.draft_success", trx)
}

// ExecuteTransaction records a single physical pick scan and deducts stock atomically.
func (h *StockTransactionHandler) ExecuteTransaction(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.ExecuteTransactionRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.trxService.ExecuteTransaction(c.Request.Context(), req, uint(userID)); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.transaction.pick_success", nil)
}

// BatchExecuteTransactions executes multiple physical picking scans sequentially and returns per-item outcomes.
func (h *StockTransactionHandler) BatchExecuteTransactions(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.BatchExecuteTransactionRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	result, err := h.trxService.BatchExecuteTransactions(c.Request.Context(), req, uint(userID))
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.transaction.batch_sync_success", result)
}

// GetOnHoldFulfillments lists all fulfillment transactions currently in HOLD_REPLENISHMENT or OUT_OF_STOCK status.
func (h *StockTransactionHandler) GetOnHoldFulfillments(c *gin.Context) {
	building := strings.TrimSpace(c.Query("building"))
	fulfillments, err := h.trxService.GetOnHoldFulfillments(c.Request.Context(), building)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, fulfillments)
}

// ReleaseHeldFulfillment re-validates display availability and reserves stock to release a held order for picking.
func (h *StockTransactionHandler) ReleaseHeldFulfillment(c *gin.Context) {
	if _, ok := utils.RequireUserID(c); !ok {
		return
	}

	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil || id == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_ID")
		return
	}

	trx, err := h.trxService.ReleaseHeldFulfillment(c.Request.Context(), uint(id))
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.transaction.release_success", trx)
}
