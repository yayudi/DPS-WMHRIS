package http

import (
	"net/http"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type StatisticHandler struct {
	statisticService analytics_usecase.StatisticService
}

func NewStatisticHandler(statisticService analytics_usecase.StatisticService) *StatisticHandler {
	return &StatisticHandler{statisticService: statisticService}
}

func (h *StatisticHandler) GetStockMovements(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetStockMovementStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) RequestStockMovementsExport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[analytics_dto.ExportStatisticRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	jobID, err := h.statisticService.RequestStockMovementsExport(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.statistic.export_stock_movements_accepted", jobID)
}

func (h *StatisticHandler) GetStockTimeline(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetStockTimelineStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) RequestStockTimelineExport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[analytics_dto.ExportTimelineRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	jobID, err := h.statisticService.RequestStockTimelineExport(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.statistic.export_stock_timeline_accepted", jobID)
}

func (h *StatisticHandler) GetInventoryValue(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetInventoryValueStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) GetShopPerformance(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetShopPerformanceStats(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) GetPackageAnalysis(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	if filters.StartDate == "" || filters.EndDate == "" {
		utils.LocalizedError(c, http.StatusBadRequest, "analytics.statistic.err_start_end_date_required", nil, "VALIDATION_ERROR")
		return
	}

	data, err := h.statisticService.GetPackageComponentAnalysis(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) GetLocationAnalysis(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetLocationAnalysis(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) GetLocationCapacityDetails(c *gin.Context) {
	locationId, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetLocationCapacityDetails(c.Request.Context(), locationId, filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) ExportLocationCapacity(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	req_ptr, ok := utils.BindAndValidate[analytics_dto.ExportLocationCapacityRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	jobID, err := h.statisticService.RequestLocationCapacityExport(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.statistic.export_job_created", jobID)
}

// GetStockBuildingBreakdown handles GET /statistics/stock-movements/:productId/breakdown
func (h *StatisticHandler) GetStockBuildingBreakdown(c *gin.Context) {
	productId, ok := utils.ParseIntParam(c, "productId")
	if !ok {
		return
	}

	startDate := c.Query("startDate")
	endDate := c.Query("endDate")
	if startDate == "" || endDate == "" {
		utils.LocalizedError(c, http.StatusBadRequest, "analytics.statistic.err_start_end_date_required", nil, "VALIDATION_ERROR")
		return
	}

	data, err := h.statisticService.GetStockBuildingBreakdown(c.Request.Context(), productId, startDate, endDate)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}
