package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "CREATE_TRANSACTION_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Berhasil membuat draft transaksi", trx)
}

func (h *StockTransactionHandler) ExecuteTransaction(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.ExecuteTransactionRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	err := h.trxService.ExecuteTransaction(c.Request.Context(), req, uint(userID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "EXECUTE_PICKING_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengeksekusi pengambilan fisik", nil)
}

func (h *StockTransactionHandler) BatchExecuteTransactions(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.BatchExecuteTransactionRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna yang valid", "")
		return
	}

	result, err := h.trxService.BatchExecuteTransactions(c.Request.Context(), req, uint(userID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "BATCH_EXECUTE_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil mengeksekusi batch sinkronisasi picking", result)
}

func (h *StockTransactionHandler) GetOnHoldFulfillments(c *gin.Context) {
	building := c.Query("building")
	fulfillments, err := h.trxService.GetOnHoldFulfillments(c.Request.Context(), building)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "GET_ON_HOLD_FULFILLMENTS_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Berhasil memuat data fulfillment on-hold", fulfillments)
}

func (h *StockTransactionHandler) ReleaseHeldFulfillment(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID transaksi tidak valid", "INVALID_ID")
		return
	}

	trx, err := h.trxService.ReleaseHeldFulfillment(c.Request.Context(), uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error(), "RELEASE_FULFILLMENT_ERROR")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Fulfillment berhasil dirilis dan stok display berhasil di-reserve", trx)
}
