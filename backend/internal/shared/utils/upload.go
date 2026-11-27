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

// MaxImportUploadSize defines the maximum allowed file size for spreadsheet imports (20 MB).
const MaxImportUploadSize = 20 << 20

// SaveImportUpload menangani penerimaan dan penyimpanan file multipart form secara aman:
// - Mengambil file dari nama form field yang diberikan.
// - Memvalidasi ukuran file maksimal 20 MB (MaxImportUploadSize).
// - Membersihkan nama file dengan filepath.Base untuk mencegah directory traversal.
// - Memvalidasi ekstensi file hanya mendukung .xlsx, .xls, dan .csv.
// - Menghasilkan nama unik dengan prefix timestamp UnixNano.
// - Menyimpan file ke config.AppConfig.StoragePath/uploads/<subdir>.
// Mengembalikan (savedPath, originalName, ok). Jika gagal, otomatis mengirim ErrorResponse dan mengembalikan ok = false.
func SaveImportUpload(c *gin.Context, field, subdir string) (string, string, bool) {
	file, err := c.FormFile(field)
	if err != nil {
		LocalizedError(c, http.StatusBadRequest, "errors.no_file_uploaded", nil, "VALIDATION_ERROR")
		return "", "", false
	}

	if file.Size > MaxImportUploadSize {
		LocalizedError(c, http.StatusRequestEntityTooLarge, "errors.file_too_large", map[string]any{"max_mb": 20}, "VALIDATION_ERROR")
		return "", "", false
	}

	cleanBase := filepath.Base(file.Filename)
	if cleanBase == "" || cleanBase == "." || cleanBase == "/" || cleanBase == "\\" {
		LocalizedError(c, http.StatusBadRequest, "errors.invalid_filename", nil, "VALIDATION_ERROR")
		return "", "", false
	}

	ext := strings.ToLower(filepath.Ext(cleanBase))
	if ext != ".xlsx" && ext != ".xls" && ext != ".csv" {
		LocalizedError(c, http.StatusBadRequest, "errors.unsupported_file_format", nil, "VALIDATION_ERROR")
		return "", "", false
	}

	storageBase := config.AppConfig.StoragePath
	if storageBase == "" {
		storageBase = "./storage"
	}

	uploadDir := filepath.Join(storageBase, "uploads", subdir)
	if err := os.MkdirAll(uploadDir, 0750); err != nil {
		LocalizedError(c, http.StatusInternalServerError, "errors.storage_dir_failed", map[string]any{"detail": err.Error()}, "INTERNAL_ERROR")
		return "", "", false
	}

	uniqueFilename := fmt.Sprintf("%d_%s", time.Now().UnixNano(), cleanBase)
	savePath := filepath.Join(uploadDir, uniqueFilename)

	if err := c.SaveUploadedFile(file, savePath); err != nil {
		LocalizedError(c, http.StatusInternalServerError, "errors.file_save_failed", map[string]any{"detail": err.Error()}, "INTERNAL_ERROR")
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

