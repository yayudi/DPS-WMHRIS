package http

import (
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"

	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Export job created successfully",
		"data": map[string]interface{}{
			"jobId": jobID,
		},
	})
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

	ext := strings.ToLower(filepath.Ext(origName))
	if ext != ".xlsx" && ext != ".xls" && ext != ".csv" {
		_ = os.Remove(savedPath)
		utils.ErrorResponse(c, http.StatusBadRequest, "Format file tidak didukung", "")
		return
	}

	notes := "Batch Package Update"
	req := system_dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          "IMPORT_PACKAGES",
		OriginalFilename: origName,
		FilePath:         savedPath,
		Notes:            &notes,
	}

	jobID, err := h.jobService.CreateImportJob(c.Request.Context(), req)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	utils.RawResponse(c, http.StatusOK, gin.H{
		"success": true,
		"message": "Import job created successfully",
		"data": map[string]interface{}{
			"jobId": jobID,
		},
	})
}
