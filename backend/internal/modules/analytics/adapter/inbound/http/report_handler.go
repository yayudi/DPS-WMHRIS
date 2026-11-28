// Package http provides Gin HTTP handlers for the analytics bounded context.
package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// ReportHandler handles HTTP endpoints for stock report exports, export job listing/downloads, and report filters.
type ReportHandler struct {
	reportService  analytics_port.ReportService
	jobService     system_port.JobService
	storageService system_port.StorageService
}

// NewReportHandler constructs a ReportHandler wired to analytics and system inbound ports.
func NewReportHandler(reportService analytics_port.ReportService, jobService system_port.JobService, storageService system_port.StorageService) *ReportHandler {
	return &ReportHandler{
		reportService:  reportService,
		jobService:     jobService,
		storageService: storageService,
	}
}

// RequestStockReport enqueues an asynchronous stock report Excel export job for the authenticated user.
func (h *ReportHandler) RequestStockReport(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	var filters map[string]any
	if err := c.ShouldBindJSON(&filters); err != nil || filters == nil {
		filters = make(map[string]any)
	}

	filters["exportType"] = "STOCK_REPORT"

	filtersBytes, err := json.Marshal(filters)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
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

// GetUserExportJobs lists the authenticated user's recent report export jobs.
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

// DownloadExportJob generates a short-lived presigned download URL for a completed export job owned by the caller and redirects to it.
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
		if errors.Is(err, sql.ErrNoRows) {
			utils.LocalizedError(c, http.StatusNotFound, "system.jobs.not_found", nil, "NOT_FOUND")
			return
		}
		utils.HandleDomainError(c, err)
		return
	}
	if job == nil {
		utils.LocalizedError(c, http.StatusNotFound, "system.jobs.not_found", nil, "NOT_FOUND")
		return
	}

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

// FetchReportFilters returns available buildings, purposes, and purpose-to-building filter metadata.
func (h *ReportHandler) FetchReportFilters(c *gin.Context) {
	filters, err := h.reportService.GetReportFilters(c.Request.Context())
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, filters)
}
