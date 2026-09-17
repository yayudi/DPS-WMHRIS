package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type InvestigationHandler struct {
	investigationService inventory_port.InvestigationUseCase
}

func NewInvestigationHandler(investigationService inventory_port.InvestigationUseCase) *InvestigationHandler {
	return &InvestigationHandler{investigationService: investigationService}
}

func (h *InvestigationHandler) GetDuplicateTransactions(c *gin.Context) {
	req_ptr, ok := utils.BindQueryAndValidate[inventory_dto.GetDuplicateTransactionsRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	// Gin's DefaultQuery handles simple cases, but if we used struct binding with default tags, it might work too.
	if req.Page == 0 {
		req.Page = 1
	}
	if req.Limit == 0 {
		req.Limit = 10
	}

	result, err := h.investigationService.GetDuplicateTransactions(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	resMap := result.(map[string]interface{})
	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data":    resMap["data"],
		"meta":    resMap["meta"],
	})
}

func (h *InvestigationHandler) RevertTransaction(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID tidak valid", "")
		return
	}

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	err = h.investigationService.RevertTransaction(c.Request.Context(), id, userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Transaksi berhasil di-revert dan stok dikembalikan.", nil)
}
