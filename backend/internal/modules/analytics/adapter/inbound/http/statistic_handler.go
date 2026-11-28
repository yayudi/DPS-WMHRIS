package http

import (
	"net/http"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// StatisticHandler handles HTTP endpoints for warehouse analytics statistics and async export requests.
type StatisticHandler struct {
	statisticService analytics_port.StatisticService
}

// NewStatisticHandler constructs a StatisticHandler backed by the analytics StatisticService port.
func NewStatisticHandler(statisticService analytics_port.StatisticService) *StatisticHandler {
	return &StatisticHandler{statisticService: statisticService}
}

// GetStockMovements returns per-SKU stock movement velocity and aggregated timeline series.
func (h *StatisticHandler) GetStockMovements(c *gin.Context) {
	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

	data, err := h.statisticService.GetStockMovementStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// RequestStockMovementsExport enqueues a background export job for stock movement statistics.
func (h *StatisticHandler) RequestStockMovementsExport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[analytics_dto.ExportStatisticRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	jobID, err := h.statisticService.RequestStockMovementsExport(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.statistic.export_stock_movements_accepted", jobID)
}

// GetStockTimeline returns inbound, outbound, and net stock change per time bucket.
func (h *StatisticHandler) GetStockTimeline(c *gin.Context) {
	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

	data, err := h.statisticService.GetStockTimelineStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// RequestStockTimelineExport enqueues a background export job for the stock timeline report.
func (h *StatisticHandler) RequestStockTimelineExport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[analytics_dto.ExportTimelineRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	jobID, err := h.statisticService.RequestStockTimelineExport(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.statistic.export_stock_timeline_accepted", jobID)
}

// GetInventoryValue returns inventory valuation, portfolio share, and stock health status per SKU.
func (h *StatisticHandler) GetInventoryValue(c *gin.Context) {
	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

	data, err := h.statisticService.GetInventoryValueStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetShopPerformance returns aggregated sales channel performance statistics.
func (h *StatisticHandler) GetShopPerformance(c *gin.Context) {
	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

	data, err := h.statisticService.GetShopPerformanceStats(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetPackageAnalysis returns component demand and deficit analysis across sold packages for a required date range.
func (h *StatisticHandler) GetPackageAnalysis(c *gin.Context) {
	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

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

// GetLocationAnalysis returns per-location load metrics and duplicate-location SKU warnings.
func (h *StatisticHandler) GetLocationAnalysis(c *gin.Context) {
	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

	data, err := h.statisticService.GetLocationAnalysis(c.Request.Context(), filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// GetLocationCapacityDetails returns per-SKU stock weight and CBM details for a specific location ID.
func (h *StatisticHandler) GetLocationCapacityDetails(c *gin.Context) {
	locationID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	filtersPtr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filtersPtr

	data, err := h.statisticService.GetLocationCapacityDetails(c.Request.Context(), locationID, filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

// ExportLocationCapacity enqueues a background export job for warehouse location capacity data.
func (h *StatisticHandler) ExportLocationCapacity(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	reqPtr, ok := utils.BindAndValidate[analytics_dto.ExportLocationCapacityRequest](c)
	if !ok {
		return
	}
	req := *reqPtr

	jobID, err := h.statisticService.RequestLocationCapacityExport(c.Request.Context(), userID, req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.statistic.export_job_created", jobID)
}

// GetStockBuildingBreakdown handles GET /statistics/stock-movements/:productId/breakdown.
func (h *StatisticHandler) GetStockBuildingBreakdown(c *gin.Context) {
	productID, ok := utils.ParseIntParam(c, "productId")
	if !ok {
		return
	}

	startDate := c.Query("startDate")
	endDate := c.Query("endDate")
	if startDate == "" || endDate == "" {
		utils.LocalizedError(c, http.StatusBadRequest, "analytics.statistic.err_start_end_date_required", nil, "VALIDATION_ERROR")
		return
	}

	data, err := h.statisticService.GetStockBuildingBreakdown(c.Request.Context(), productID, startDate, endDate)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}
