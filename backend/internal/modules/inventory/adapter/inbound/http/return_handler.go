package http

import (
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"

	"log"
	"net/http"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type ReturnHandler struct {
	returnService inventory_port.ReturnUseCase
}

func NewReturnHandler(returnService inventory_port.ReturnUseCase) *ReturnHandler {
	return &ReturnHandler{returnService: returnService}
}

func (h *ReturnHandler) GetPendingReturns(c *gin.Context) {
	page, limit := utils.ParsePagination(c, 10)
	search := c.Query("search")

	offset := (page - 1) * limit

	params := map[string]interface{}{
		"limit":  limit,
		"offset": offset,
		"search": search,
	}

	rows, total, err := h.returnService.GetPendingReturns(c.Request.Context(), params)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	totalPages := (total + limit - 1) / limit

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"data":    rows,
		"pagination": map[string]interface{}{
			"page":       page,
			"limit":      limit,
			"total":      total,
			"totalPages": totalPages,
		},
	})
}

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
		"data": map[string]interface{}{
			"marketplace_returns": marketplaceResult.Data,
			"manual_returns":      manualResult.Data,
		},
		"pagination": map[string]interface{}{
			"marketplace_total": marketplaceResult.Total,
			"manual_total":      manualResult.Total,
			"page":              page,
			"limit":             limit,
		},
	})
}

func (h *ReturnHandler) ApproveReturn(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.ApproveReturnRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	err := h.returnService.ApproveReturn(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.return.process_success", nil)
}

func (h *ReturnHandler) CreateManualReturn(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[inventory_dto.CreateManualReturnRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	err := h.returnService.CreateManualReturn(c.Request.Context(), userID, req)
	if err != nil {
		log.Printf("[CreateManualReturn] error: %v", err)
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "wms.return.manual_record_success", nil)
}
