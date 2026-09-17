package http

import (
	"net/http"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"

	"strconv"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type StatisticHandler struct {
	statisticService analytics_usecase.StatisticService
}

func NewStatisticHandler(statisticService analytics_usecase.StatisticService) *StatisticHandler {
	return &StatisticHandler{statisticService: statisticService}
}

// helper untuk mengekstrak user_id dari gin context (JWT map claims parses numbers as float64)
func getStatUserID(c *gin.Context) int {
	val, exists := c.Get("user_id")
	if !exists {
		return 0
	}
	switch v := val.(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return 0
	}
}

func (h *StatisticHandler) GetStockMovements(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetStockMovementStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) RequestStockMovementsExport(c *gin.Context) {
	_, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[analytics_dto.ExportStatisticRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	jobID, err := h.statisticService.RequestStockMovementsExport(c.Request.Context(), getStatUserID(c), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusAccepted, "Permintaan ekspor statistik stok diterima. File sedang diproses.", jobID)
}

func (h *StatisticHandler) GetStockTimeline(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetStockTimelineStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) RequestStockTimelineExport(c *gin.Context) {
	_, exists := c.Get("user_id")
	if !exists {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Unauthorized", "")
		return
	}

	req_ptr, ok := utils.BindAndValidate[analytics_dto.ExportTimelineRequest](c)
	if !ok {
		return
	}
	req := *req_ptr

	jobID, err := h.statisticService.RequestStockTimelineExport(c.Request.Context(), getStatUserID(c), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessResponse(c, http.StatusAccepted, "Permintaan ekspor statistik timeline stok diterima. File sedang diproses.", jobID)
}

func (h *StatisticHandler) GetInventoryValue(c *gin.Context) {
	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetInventoryValueStatistics(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
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
		utils.ErrorResponse(c, http.StatusBadRequest, "startDate dan endDate wajib diisi", "")
		return
	}

	data, err := h.statisticService.GetPackageComponentAnalysis(c.Request.Context(), filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) GetLocationCapacityDetails(c *gin.Context) {
	locationIdStr := c.Param("id")
	locationId, err := strconv.Atoi(locationIdStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid location ID", "")
		return
	}

	filters_ptr, ok := utils.BindQueryAndValidate[analytics_dto.StatisticFilterRequest](c)
	if !ok {
		return
	}
	filters := *filters_ptr

	data, err := h.statisticService.GetLocationCapacityDetails(c.Request.Context(), locationId, filters)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}

func (h *StatisticHandler) ExportLocationCapacity(c *gin.Context) {
	userId, _ := c.Get("user_id")

	var req analytics_dto.ExportLocationCapacityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Format request tidak valid", "")
		return
	}

	jobID, err := h.statisticService.RequestLocationCapacityExport(c.Request.Context(), userId.(int), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal membuat job export", err.Error())
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, gin.H{
		"job_id":  jobID,
		"message": "Export job berhasil dibuat",
	})
}

// GetStockBuildingBreakdown handles GET /statistics/stock-movements/:productId/breakdown
func (h *StatisticHandler) GetStockBuildingBreakdown(c *gin.Context) {
	productIdStr := c.Param("productId")
	productId, err := strconv.Atoi(productIdStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid product ID", "")
		return
	}

	startDate := c.Query("startDate")
	endDate := c.Query("endDate")
	if startDate == "" || endDate == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "startDate dan endDate wajib diisi", "VALIDATION_ERROR")
		return
	}

	data, err := h.statisticService.GetStockBuildingBreakdown(c.Request.Context(), productId, startDate, endDate)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, data)
}
