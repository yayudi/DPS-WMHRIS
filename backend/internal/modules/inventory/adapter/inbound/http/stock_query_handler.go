package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// StockQueryHandler exposes read-only HTTP endpoints for stock balance queries.
type StockQueryHandler struct {
	queryService port.StockQueryUseCase
}

// NewStockQueryHandler creates a new StockQueryHandler.
func NewStockQueryHandler(queryService port.StockQueryUseCase) *StockQueryHandler {
	return &StockQueryHandler{
		queryService: queryService,
	}
}

// GetBalances returns stock balances optionally filtered by positive integer location_id and product_id query params.
func (h *StockQueryHandler) GetBalances(c *gin.Context) {
	var locID *int
	var prodID *int

	if locParam := strings.TrimSpace(c.Query("location_id")); locParam != "" {
		id, err := strconv.Atoi(locParam)
		if err != nil || id <= 0 {
			utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_LOCATION_ID")
			return
		}
		locID = &id
	}

	if prodParam := strings.TrimSpace(c.Query("product_id")); prodParam != "" {
		id, err := strconv.Atoi(prodParam)
		if err != nil || id <= 0 {
			utils.ErrorResponse(c, http.StatusBadRequest, "errors.validation_error", "INVALID_PRODUCT_ID")
			return
		}
		prodID = &id
	}

	balances, err := h.queryService.GetStockBalances(c.Request.Context(), locID, prodID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, balances)
}
