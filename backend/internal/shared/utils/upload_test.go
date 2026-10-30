package utils

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/dps-wmhris/backend/internal/shared/config"
)

func TestSaveImportUpload(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Set temporary directory as storage path
	tempStorage := t.TempDir()
	origStorage := config.AppConfig.StoragePath
	config.AppConfig.StoragePath = tempStorage
	defer func() { config.AppConfig.StoragePath = origStorage }()

	t.Run("Successfully saves valid file upload", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, err := writer.CreateFormFile("file", "test_stock.xlsx")
		if err != nil {
			t.Fatalf("CreateFormFile error: %v", err)
		}
		part.Write([]byte("dummy content"))
		writer.Close()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodPost, "/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		c.Request = req

		savedPath, origName, ok := SaveImportUpload(c, "file", "stock")
		if !ok {
			t.Fatalf("SaveImportUpload returned ok = false, response: %s", w.Body.String())
		}
		if origName != "test_stock.xlsx" {
			t.Errorf("expected origName 'test_stock.xlsx', got '%s'", origName)
		}

		if _, err := os.Stat(savedPath); os.IsNotExist(err) {
			t.Fatalf("saved file does not exist at path: %s", savedPath)
		}

		// Ensure it was saved in expected subdirectory
		expectedDir := filepath.Join(tempStorage, "uploads", "stock")
		if filepath.Dir(savedPath) != expectedDir {
			t.Errorf("expected file in '%s', got '%s'", expectedDir, filepath.Dir(savedPath))
		}
	})

	t.Run("Fails when file form field is missing", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		writer.Close()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodPost, "/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		c.Request = req

		_, _, ok := SaveImportUpload(c, "file", "stock")
		if ok {
			t.Errorf("expected ok = false for missing file")
		}
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d", w.Code)
		}
	})

	t.Run("Sanitizes directory traversal in filename", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("file", "../../malicious.xlsx")
		part.Write([]byte("malicious content"))
		writer.Close()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodPost, "/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		c.Request = req

		savedPath, _, ok := SaveImportUpload(c, "file", "stock")
		if !ok {
			t.Fatalf("expected ok = true with sanitized filename, got false: %s", w.Body.String())
		}

		// Verify the file was stored inside the safe upload directory, not traversed outside
		expectedDir := filepath.Join(tempStorage, "uploads", "stock")
		if filepath.Dir(savedPath) != expectedDir {
			t.Errorf("path traversal not sanitized; expected dir '%s', got '%s'", expectedDir, filepath.Dir(savedPath))
		}
	})
}
