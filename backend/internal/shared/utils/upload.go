package utils

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/dps-wmhris/backend/internal/shared/config"
)

// SaveImportUpload menangani penerimaan dan penyimpanan file multipart form secara aman:
// - Mengambil file dari nama form field yang diberikan.
// - Membersihkan nama file dengan filepath.Base untuk mencegah directory traversal.
// - Memvalidasi ekstensi file hanya mendukung .xlsx, .xls, dan .csv.
// - Menghasilkan nama unik dengan prefix timestamp UnixNano.
// - Menyimpan file ke config.AppConfig.StoragePath/uploads/<subdir>.
// Mengembalikan (savedPath, originalName, ok). Jika gagal, otomatis mengirim ErrorResponse dan mengembalikan ok = false.
func SaveImportUpload(c *gin.Context, field, subdir string) (string, string, bool) {
	file, err := c.FormFile(field)
	if err != nil {
		ErrorResponse(c, http.StatusBadRequest, "Tidak ada file yang diunggah.", "VALIDATION_ERROR")
		return "", "", false
	}

	cleanBase := filepath.Base(file.Filename)
	if cleanBase == "" || cleanBase == "." || cleanBase == "/" || cleanBase == "\\" {
		ErrorResponse(c, http.StatusBadRequest, "Nama file tidak valid.", "VALIDATION_ERROR")
		return "", "", false
	}

	ext := strings.ToLower(filepath.Ext(cleanBase))
	if ext != ".xlsx" && ext != ".xls" && ext != ".csv" {
		ErrorResponse(c, http.StatusBadRequest, "Format file tidak didukung. Gunakan file .xlsx, .xls, atau .csv.", "VALIDATION_ERROR")
		return "", "", false
	}

	storageBase := config.AppConfig.StoragePath
	if storageBase == "" {
		storageBase = "./storage"
	}

	uploadDir := filepath.Join(storageBase, "uploads", subdir)
	if err := os.MkdirAll(uploadDir, 0750); err != nil {
		ErrorResponse(c, http.StatusInternalServerError, "Gagal menyiapkan direktori penyimpanan: "+err.Error(), "INTERNAL_ERROR")
		return "", "", false
	}

	uniqueFilename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), cleanBase)
	savePath := filepath.Join(uploadDir, uniqueFilename)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		ErrorResponse(c, http.StatusInternalServerError, "Gagal menyimpan file: "+err.Error(), "INTERNAL_ERROR")
		return "", "", false
	}

	return savePath, file.Filename, true
}

// ParseImportJobMeta mengekstrak metadata form upload (dryRun & notes) secara konsisten.
// Mengembalikan (jobType, finalNotes, isDryRun).
func ParseImportJobMeta(c *gin.Context, baseJobType, defaultNotes, dryRunNotes string) (string, string, bool) {
	dryRunVal := strings.ToLower(strings.TrimSpace(c.PostForm("dryRun")))
	isDryRun := dryRunVal == "true" || dryRunVal == "1"

	jobType := baseJobType
	notes := defaultNotes
	if isDryRun {
		jobType = baseJobType + "_DRY_RUN"
		if dryRunNotes != "" {
			notes = dryRunNotes
		}
	}

	if userNotes := strings.TrimSpace(c.PostForm("notes")); userNotes != "" {
		if notes != "" {
			notes += " | " + userNotes
		} else {
			notes = userNotes
		}
	}

	return jobType, notes, isDryRun
}

