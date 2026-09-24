package http

import (
	"net/http"
	"strconv"

	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type StockQueryHandler struct {
	queryService port.StockQueryUseCase
}

func NewStockQueryHandler(queryService port.StockQueryUseCase) *StockQueryHandler {
	return &StockQueryHandler{
		queryService: queryService,
	}
}

func (h *StockQueryHandler) GetBalances(c *gin.Context) {
	var locID *int
	var prodID *int

	locParam := c.Query("location_id")
	if locParam != "" {
		id, err := strconv.Atoi(locParam)
		if err == nil {
			locID = &id
		}
	}

	prodParam := c.Query("product_id")
	if prodParam != "" {
		id, err := strconv.Atoi(prodParam)
		if err == nil {
			prodID = &id
		}
	}

	balances, err := h.queryService.GetStockBalances(c.Request.Context(), locID, prodID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get stock balances", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Successfully retrieved stock balances", balances)
}
