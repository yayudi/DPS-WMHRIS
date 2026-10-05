package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"

	"net/http"

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

	userID := getUserID(c)
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
