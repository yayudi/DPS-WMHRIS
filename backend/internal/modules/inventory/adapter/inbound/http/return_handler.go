package http

import (
	"log"
	"net/http"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// ReturnHandler exposes HTTP endpoints for viewing return history and recording manual returns.
type ReturnHandler struct {
	returnService inventory_port.ReturnUseCase
}

// NewReturnHandler creates a new ReturnHandler.
func NewReturnHandler(returnService inventory_port.ReturnUseCase) *ReturnHandler {
	return &ReturnHandler{returnService: returnService}
}

// GetPendingReturns lists pending return items with pagination.
func (h *ReturnHandler) GetPendingReturns(c *gin.Context) {
	page, limit := utils.ParsePagination(c, 10)
	search := c.Query("search")

	offset := (page - 1) * limit
	params := map[string]any{
		"limit":  limit,
		"offset": offset,
		"search": search,
	}

	rows, total, err := h.returnService.GetPendingReturns(c.Request.Context(), params)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	totalPages := 0
	if limit > 0 {
		totalPages = (total + limit - 1) / limit
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data":    rows,
		"pagination": map[string]any{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": totalPages,
		},
	})
}

// GetReturnHistory returns paginated marketplace and manual return histories.
func (h *ReturnHandler) GetReturnHistory(c *gin.Context) {
	page, limit := utils.ParsePagination(c, 10)
	search := c.Query("search")

	marketplaceResult, err := h.returnService.GetMarketplaceReturnHistory(c.Request.Context(), page, limit, search)
	if err != nil {
		log.Printf("[ReturnHistory] MarketplaceReturnHistory error: %v", err)
		utils.HandleDomainError(c, err)
		return
	}

	manualResult, err := h.returnService.GetManualReturnHistory(c.Request.Context(), page, limit, search)
	if err != nil {
		log.Printf("[ReturnHistory] ManualReturnHistory error: %v", err)
		utils.HandleDomainError(c, err)
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data": map[string]any{
			"marketplace_returns": marketplaceResult.Data,
			"manual_returns":      manualResult.Data,
		},
		"pagination": map[string]any{
			"marketplace_total": marketplaceResult.Total,
			"manual_total":      manualResult.Total,
			"page":              page,
			"limit":             limit,
		},
	})
}

// ApproveReturn handles legacy marketplace return approval requests.
func (h *ReturnHandler) ApproveReturn(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.ApproveReturnRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.returnService.ApproveReturn(c.Request.Context(), userID, req); err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.return.process_success", nil)
}

// CreateManualReturn records a manual customer return and increments destination stock atomically.
func (h *ReturnHandler) CreateManualReturn(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[inventory_dto.CreateManualReturnRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	if err := h.returnService.CreateManualReturn(c.Request.Context(), userID, req); err != nil {
		log.Printf("[CreateManualReturn] error: %v", err)
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.return.manual_record_success", nil)
}
