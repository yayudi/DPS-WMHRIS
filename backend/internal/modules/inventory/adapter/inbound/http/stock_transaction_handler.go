package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"

	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type StockTransactionHandler struct {
	trxService inventory_port.StockTransactionUseCase
}

func NewStockTransactionHandler(trxService inventory_port.StockTransactionUseCase) *StockTransactionHandler {
	return &StockTransactionHandler{trxService: trxService}
}

func (h *StockTransactionHandler) CreateTransaction(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.CreateTransactionRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	trx, err := h.trxService.CreateTransaction(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "wms.transaction.draft_success", trx)
}

func (h *StockTransactionHandler) ExecuteTransaction(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.ExecuteTransactionRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	err := h.trxService.ExecuteTransaction(c.Request.Context(), req, uint(userID))
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.transaction.pick_success", nil)
}

func (h *StockTransactionHandler) BatchExecuteTransactions(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.BatchExecuteTransactionRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	result, err := h.trxService.BatchExecuteTransactions(c.Request.Context(), req, uint(userID))
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.transaction.batch_sync_success", result)
}

func (h *StockTransactionHandler) GetOnHoldFulfillments(c *gin.Context) {
	building := c.Query("building")
	fulfillments, err := h.trxService.GetOnHoldFulfillments(c.Request.Context(), building)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, fulfillments)
}

func (h *StockTransactionHandler) ReleaseHeldFulfillment(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
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
