package handler

import (
	"log"
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

type ReturnHandler struct {
	returnService service.ReturnService
}

func NewReturnHandler(returnService service.ReturnService) *ReturnHandler {
	return &ReturnHandler{returnService: returnService}
}

func (h *ReturnHandler) GetPendingReturns(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	search := c.Query("search")

	offset := (page - 1) * limit

	params := map[string]interface{}{
		"limit":  limit,
		"offset": offset,
		"search": search,
	}

	rows, total, err := h.returnService.GetPendingReturns(c.Request.Context(), params)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
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
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	search := c.Query("search")

	marketplaceResult, err := h.returnService.GetMarketplaceReturnHistory(c.Request.Context(), page, limit, search)
	if err != nil {
		log.Printf("[ReturnHistory] MarketplaceReturnHistory error: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	manualResult, err := h.returnService.GetManualReturnHistory(c.Request.Context(), page, limit, search)
	if err != nil {
		log.Printf("[ReturnHistory] ManualReturnHistory error: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
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
	req_ptr, ok := utils.BindAndValidate[dto.ApproveReturnRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	err := h.returnService.ApproveReturn(c.Request.Context(), userID, req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Retur berhasil diproses.", nil)
}

func (h *ReturnHandler) CreateManualReturn(c *gin.Context) {
	req_ptr, ok := utils.BindAndValidate[dto.CreateManualReturnRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	err := h.returnService.CreateManualReturn(c.Request.Context(), userID, req)
	if err != nil {
		log.Printf("[CreateManualReturn] error: %v", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Retur manual berhasil dicatat.", nil)
}
