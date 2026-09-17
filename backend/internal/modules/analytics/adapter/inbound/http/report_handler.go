package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	"encoding/json"
	"net/http"
	"strconv"

	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type ReportHandler struct {
	reportService  analytics_usecase.ReportService
	jobService     system_usecase.JobService
	storageService system_usecase.StorageService
	jobRepo        system_mysql.JobRepository
}

func NewReportHandler(reportService analytics_usecase.ReportService, jobService system_usecase.JobService, storageService system_usecase.StorageService, jobRepo system_mysql.JobRepository) *ReportHandler {
	return &ReportHandler{
		reportService:  reportService,
		jobService:     jobService,
		storageService: storageService,
		jobRepo:        jobRepo,
	}
}

func (h *ReportHandler) RequestStockReport(c *gin.Context) {
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.RawResponse(c, http.StatusAccepted, gin.H{
		"message": "Permintaan ekspor diterima. Laporan sedang dibuat.",
		"jobId":   jobID,
	})
}

func (h *ReportHandler) GetUserExportJobs(c *gin.Context) {
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	jobs, err := h.reportService.GetUserExportJobs(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, jobs)
}

// DownloadExportJob menghasilkan presigned URL untuk mendownload file export,
// lalu redirect browser ke URL tersebut. URL expire setelah 5 menit.
func (h *ReportHandler) DownloadExportJob(c *gin.Context) {
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	idStr := c.Param("id")
	jobID, err := strconv.Atoi(idStr)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "ID job tidak valid", "")
		return
	}

	job, err := h.jobRepo.GetExportJobByID(c.Request.Context(), jobID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Job tidak ditemukan", "")
		return
	}

	// Pastikan user hanya bisa download job miliknya
	if job.UserID != userID {
		utils.ErrorResponse(c, http.StatusForbidden, "Anda tidak memiliki akses ke job ini", "")
		return
	}

	if job.Status != "COMPLETED" || job.FilePath == nil || *job.FilePath == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "File belum tersedia untuk diunduh", "")
		return
	}

	presignedURL, err := h.storageService.GeneratePresignedDownloadUrl(c.Request.Context(), *job.FilePath)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal membuat link download", "")
		return
	}

	c.Redirect(http.StatusFound, presignedURL)
}

func (h *ReportHandler) FetchReportFilters(c *gin.Context) {
	filters, err := h.reportService.GetReportFilters(c.Request.Context())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.SuccessDataResponse(c, http.StatusOK, filters)
}

func getUserID(c *gin.Context) int {
	userID, _ := c.Get("user_id")
	if id, ok := userID.(int); ok {
		return id
	}
	return 0
}
