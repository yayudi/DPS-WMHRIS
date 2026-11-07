package utils

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
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

	t.Run("Rejects invalid file extension", func(t *testing.T) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		part, _ := writer.CreateFormFile("file", "script.sh")
		part.Write([]byte("echo malicious"))
		writer.Close()

		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req, _ := http.NewRequest(http.MethodPost, "/upload", body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		c.Request = req

		_, _, ok := SaveImportUpload(c, "file", "stock")
		if ok {
			t.Errorf("expected ok = false for disallowed extension .sh")
		}
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d", w.Code)
		}
	})
}

func TestParseImportJobMeta(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name             string
		dryRunVal        string
		notesVal         string
		baseType         string
		defaultNotes     string
		dryRunNotes      string
		expectedJobType  string
		expectedNotes    string
		expectedIsDryRun bool
	}{
		{
			name:             "Standard run without notes",
			dryRunVal:        "",
			notesVal:         "",
			baseType:         "IMPORT_STOCK_INBOUND",
			defaultNotes:     "Import Inbound",
			dryRunNotes:      "Simulasi Inbound (Dry Run)",
			expectedJobType:  "IMPORT_STOCK_INBOUND",
			expectedNotes:    "Import Inbound",
			expectedIsDryRun: false,
		},
		{
			name:             "Standard run with user notes",
			dryRunVal:        "false",
			notesVal:         "Batch PO-1029",
			baseType:         "IMPORT_STOCK_INBOUND",
			defaultNotes:     "Import Inbound",
			dryRunNotes:      "Simulasi Inbound (Dry Run)",
			expectedJobType:  "IMPORT_STOCK_INBOUND",
			expectedNotes:    "Import Inbound | Batch PO-1029",
			expectedIsDryRun: false,
		},
		{
			name:             "Dry run with dryRun=true",
			dryRunVal:        "true",
			notesVal:         "Pengecekan stok awal",
			baseType:         "ADJUST_STOCK",
			defaultNotes:     "Penyesuaian Stok Massal",
			dryRunNotes:      "Simulasi Penyesuaian Stok (Dry Run)",
			expectedJobType:  "ADJUST_STOCK_DRY_RUN",
			expectedNotes:    "Simulasi Penyesuaian Stok (Dry Run) | Pengecekan stok awal",
			expectedIsDryRun: true,
		},
		{
			name:             "Dry run with dryRun=1",
			dryRunVal:        "1",
			notesVal:         "",
			baseType:         "ADJUST_STOCK",
			defaultNotes:     "Penyesuaian Stok Massal",
			dryRunNotes:      "Simulasi Penyesuaian Stok (Dry Run)",
			expectedJobType:  "ADJUST_STOCK_DRY_RUN",
			expectedNotes:    "Simulasi Penyesuaian Stok (Dry Run)",
			expectedIsDryRun: true,
		},
		{
			name:             "Dry run without dryRunNotes fallback",
			dryRunVal:        "true",
			notesVal:         "Testing shift",
			baseType:         "IMPORT_SCHEDULES",
			defaultNotes:     "Import Jadwal Shift",
			dryRunNotes:      "",
			expectedJobType:  "IMPORT_SCHEDULES_DRY_RUN",
			expectedNotes:    "Import Jadwal Shift | Testing shift",
			expectedIsDryRun: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			form := url.Values{}
			if tt.dryRunVal != "" {
				form.Set("dryRun", tt.dryRunVal)
			}
			if tt.notesVal != "" {
				form.Set("notes", tt.notesVal)
			}

			req, _ := http.NewRequest(http.MethodPost, "/test", strings.NewReader(form.Encode()))
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			c.Request = req

			jobType, finalNotes, isDryRun := ParseImportJobMeta(c, tt.baseType, tt.defaultNotes, tt.dryRunNotes)

			if jobType != tt.expectedJobType {
				t.Errorf("jobType = %q, want %q", jobType, tt.expectedJobType)
			}
			if finalNotes != tt.expectedNotes {
				t.Errorf("finalNotes = %q, want %q", finalNotes, tt.expectedNotes)
			}
			if isDryRun != tt.expectedIsDryRun {
				t.Errorf("isDryRun = %v, want %v", isDryRun, tt.expectedIsDryRun)
			}
		})
	}
}


