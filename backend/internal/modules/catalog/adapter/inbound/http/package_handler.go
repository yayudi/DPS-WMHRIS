package http

import (
	"encoding/json"
	"net/http"
	"os"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// PackageHandler exposes HTTP endpoints for asynchronous package export and bulk update jobs.
type PackageHandler struct {
	jobService system_port.JobService
}

// NewPackageHandler creates a new PackageHandler.
func NewPackageHandler(jobService system_port.JobService) *PackageHandler {
	return &PackageHandler{jobService: jobService}
}

// ExportPackages queues an asynchronous export job for package products.
func (h *PackageHandler) ExportPackages(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	filtersMap := map[string]any{
		"exportType": "EXPORT_PACKAGES",
		"format":     c.DefaultQuery("format", "xlsx"),
		"search":     c.Query("search"),
		"searchBy":   c.Query("searchBy"),
		"status":     c.Query("status"),
	}

	filtersBytes, err := json.Marshal(filtersMap)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}
	filtersStr := string(filtersBytes)

	req := system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "EXPORT_PACKAGES",
		Filters: &filtersStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), req)
	if err != nil {
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "master_data.package.export_job_queued", jobID)
}

// ImportPackagesBatch queues an asynchronous bulk package update or dry-run job.
func (h *PackageHandler) ImportPackagesBatch(c *gin.Context) {
	userID, ok := utils.RequireUserID(c)
	if !ok {
		return
	}

	savedPath, origName, ok := utils.SaveImportUpload(c, "file", "package")
	if !ok {
		return
	}

	jobType, notes, _ := utils.ParseImportJobMeta(
		c,
		"IMPORT_PACKAGES",
		"Batch Package Update",
		"Simulasi Batch Package Update",
	)

	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          jobType,
		OriginalFilename: origName,
		FilePath:         savedPath,
		Notes:            &notes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		_ = os.Remove(savedPath)
		utils.HandleDomainError(c, err)
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "master_data.package.import_job_queued", jobID)
}
