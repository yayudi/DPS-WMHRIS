package utils

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/dps-wmhris/backend/internal/shared/config"
)

// SaveImportUpload menangani penerimaan dan penyimpanan file multipart form secara aman:
// - Mengambil file dari nama form field yang diberikan.
// - Membersihkan nama file dengan filepath.Base untuk mencegah directory traversal.
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
