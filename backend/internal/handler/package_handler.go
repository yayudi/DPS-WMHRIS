package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/utils"

	"github.com/dps-wmhris/backend/internal/config"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type PackageHandler struct {
	jobService service.JobService
}

func NewPackageHandler(jobService service.JobService) *PackageHandler {
	return &PackageHandler{jobService: jobService}
}

func (h *PackageHandler) ExportPackages(c *gin.Context) {
	format := c.DefaultQuery("format", "xlsx")
	search := c.Query("search")
	searchBy := c.Query("searchBy")
	status := c.Query("status")

	userID := getUserID(c)
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

	req := dto.CreateExportJobRequest{
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
	userID := getUserID(c)
	if userID == 0 {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Tidak ada sesi pengguna", "")
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "File tidak ditemukan", "")
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".xlsx" && ext != ".xls" && ext != ".csv" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Format file tidak didukung", "")
		return
	}

	filename := fmt.Sprintf("import_%d%s", time.Now().UnixNano(), ext)
	uploadDir := filepath.Join(config.AppConfig.StoragePath, "uploads", "package")
	os.MkdirAll(uploadDir, os.ModePerm)
	savePath := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Gagal menyimpan file", "")
		return
	}

	notes := "Batch Package Update"
	req := dto.CreateImportJobRequest{
		UserID:           userID,
		JobType:          "IMPORT_PACKAGES",
		OriginalFilename: file.Filename,
		FilePath:         savePath,
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
