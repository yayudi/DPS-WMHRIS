package http

import (
	"net/http"

	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"

	"github.com/dps-wmhris/backend/internal/shared/utils"

	"github.com/gin-gonic/gin"
)

type StatsHandler struct {
	statsService analytics_usecase.StatsService
}

func NewStatsHandler(statsService analytics_usecase.StatsService) *StatsHandler {
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
