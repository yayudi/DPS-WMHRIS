package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	"encoding/json"
	"net/http"

	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type ReportHandler struct {
	reportService  analytics_usecase.ReportService
	jobService     system_usecase.JobService
	storageService system_usecase.StorageService
}

func NewReportHandler(reportService analytics_usecase.ReportService, jobService system_usecase.JobService, storageService system_usecase.StorageService) *ReportHandler {
	return &ReportHandler{
		reportService:  reportService,
		jobService:     jobService,
		storageService: storageService,
	}
}

func (h *ReportHandler) RequestStockReport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	var filters map[string]interface{}
	if err := c.ShouldBindJSON(&filters); err != nil {
		filters = make(map[string]interface{})
	}

	filters["exportType"] = "STOCK_REPORT" // force exportType in filters

	filtersBytes, _ := json.Marshal(filters)
	filtersStr := string(filtersBytes)

	req := system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "STOCK_REPORT",
		Filters: &filtersStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusAccepted, "analytics.report.export_requested", jobID)
}

func (h *ReportHandler) GetUserExportJobs(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	jobs, err := h.reportService.GetUserExportJobs(c.Request.Context(), userID)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, jobs)
}

// DownloadExportJob menghasilkan presigned URL untuk mendownload file export,
// lalu redirect browser ke URL tersebut. URL expire setelah 5 menit.
func (h *ReportHandler) DownloadExportJob(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	jobID, ok := utils.ParseIntParam(c, "id")
	if !ok {
		return
	}

	job, err := h.jobService.GetExportJobByID(c.Request.Context(), jobID)
	if err != nil {
		utils.LocalizedError(c, http.StatusNotFound, "system.jobs.not_found", nil, "NOT_FOUND")
		return
	}

	// Pastikan user hanya bisa download job miliknya
	if job.UserID != userID {
		utils.LocalizedError(c, http.StatusForbidden, "errors.forbidden", nil, "FORBIDDEN")
		return
	}

	if job.Status != "COMPLETED" || job.FilePath == nil || *job.FilePath == "" {
		utils.LocalizedError(c, http.StatusBadRequest, "analytics.report.err_file_not_ready", nil, "NOT_READY")
		return
	}

	presignedURL, err := h.storageService.GeneratePresignedDownloadUrl(c.Request.Context(), *job.FilePath)
	if err != nil {
		utils.LocalizedError(c, http.StatusInternalServerError, "analytics.report.err_download_link_failed", nil, "INTERNAL_ERROR")
		return
	}

	c.Redirect(http.StatusFound, presignedURL)
}

func (h *ReportHandler) FetchReportFilters(c *gin.Context) {
	filters, err := h.reportService.GetReportFilters(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, filters)
}
