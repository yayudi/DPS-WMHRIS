package handler

import (
	"github.com/dps-wmhris/backend/internal/utils"
	"net/http"

	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type StatsHandler struct {
	statsService service.StatsService
}

func NewStatsHandler(statsService service.StatsService) *StatsHandler {
	return &StatsHandler{statsService: statsService}
}

func (h *StatsHandler) FetchKpiSummary(c *gin.Context) {
	kpiData, err := h.statsService.GetKpiSummary(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, kpiData)
}
