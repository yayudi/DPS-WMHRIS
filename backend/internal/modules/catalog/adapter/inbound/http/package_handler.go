package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	"encoding/json"
	"net/http"
	"os"

	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

type PackageHandler struct {
	jobService system_usecase.JobService
}

func NewPackageHandler(jobService system_usecase.JobService) *PackageHandler {
	return &PackageHandler{jobService: jobService}
}

func (h *PackageHandler) ExportPackages(c *gin.Context) {
	format := c.DefaultQuery("format", "xlsx")
	search := c.Query("search")
	searchBy := c.Query("searchBy")
	status := c.Query("status")

	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	filtersMap := map[string]interface{}{
		"exportType": "EXPORT_PACKAGES",
		"format":     format,
		"search":     search,
		"searchBy":   searchBy,
		"status":     status,
	}

	filtersBytes, _ := json.Marshal(filtersMap)
	filtersStr := string(filtersBytes)

	req := system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "EXPORT_PACKAGES",
		Filters: &filtersStr,
	}

	jobID, err := h.jobService.CreateExportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "Export job created successfully", jobID)
}

func (h *PackageHandler) ImportPackagesBatch(c *gin.Context) {
	userID := middleware.GetUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.JobCreatedResponse(c, http.StatusOK, "Import job created successfully", jobID)
}
