package http

import (
	"net/http"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// InvestigationHandler exposes HTTP endpoints for investigating duplicate movements and reverting stock transactions.
type InvestigationHandler struct {
	investigationService inventory_port.InvestigationUseCase
}

// NewInvestigationHandler creates a new InvestigationHandler.
func NewInvestigationHandler(investigationService inventory_port.InvestigationUseCase) *InvestigationHandler {
	return &InvestigationHandler{investigationService: investigationService}
}

// GetDuplicateTransactions lists grouped duplicate stock movement candidates with pagination metadata.
func (h *InvestigationHandler) GetDuplicateTransactions(c *gin.Context) {
	reqPtr, ok := utils.BindQueryAndValidate[inventory_dto.GetDuplicateTransactionsRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 {
		req.Limit = 10
	}

	result, err := h.investigationService.GetDuplicateTransactions(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data":    result.Data,
		"meta":    result.Meta,
	})
}

// RevertTransaction reverses a stock movement by ID and records an immutable REVERSAL ledger entry.
func (h *InvestigationHandler) RevertTransaction(c *gin.Context) {
	id, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	if err := h.investigationService.RevertTransaction(c.Request.Context(), id, userID); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.investigation.revert_success", nil)
}
