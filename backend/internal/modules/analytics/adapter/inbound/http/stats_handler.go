package http

import (
	"net/http"

	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// StatsHandler handles HTTP endpoints for the command center KPI dashboard.
type StatsHandler struct {
	statsService analytics_port.StatsService
}

// NewStatsHandler constructs a StatsHandler backed by the analytics StatsService port.
func NewStatsHandler(statsService analytics_port.StatsService) *StatsHandler {
	return &StatsHandler{statsService: statsService}
}

// FetchKpiSummary returns the aggregated operational pulse, valuation, SKU health, and movement trend KPI summary.
func (h *StatsHandler) FetchKpiSummary(c *gin.Context) {
	kpiData, err := h.statsService.GetKpiSummary(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, kpiData)
}
