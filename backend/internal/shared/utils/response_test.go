package utils

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
)

func TestParseIntParam(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name       string
		paramName  string
		paramVal   string
		expectVal  int
		expectOk   bool
		expectCode int
	}{
		{
			name:       "Valid integer param",
			paramName:  "id",
			paramVal:   "123",
			expectVal:  123,
			expectOk:   true,
			expectCode: http.StatusOK,
		},
		{
			name:       "Non-numeric param",
			paramName:  "id",
			paramVal:   "abc",
			expectVal:  0,
			expectOk:   false,
			expectCode: http.StatusBadRequest,
		},
		{
			name:       "Empty param",
			paramName:  "id",
			paramVal:   "",
			expectVal:  0,
			expectOk:   false,
			expectCode: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			if tt.paramVal != "" {
				c.Params = gin.Params{{Key: tt.paramName, Value: tt.paramVal}}
			}

			val, ok := ParseIntParam(c, tt.paramName)
			if ok != tt.expectOk {
				t.Errorf("ParseIntParam() ok = %v, want %v", ok, tt.expectOk)
			}
			if val != tt.expectVal {
				t.Errorf("ParseIntParam() val = %v, want %v", val, tt.expectVal)
			}
			if !tt.expectOk && w.Code != tt.expectCode {
				t.Errorf("ParseIntParam() status code = %v, want %v", w.Code, tt.expectCode)
			}
		})
	}
}

func TestParsePagination(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		queryString  string
		defaultLimit int
		expectPage   int
		expectLimit  int
	}{
		{
			name:         "Default values when empty",
			queryString:  "",
			defaultLimit: 20,
			expectPage:   1,
			expectLimit:  20,
		},
		{
			name:         "Explicit page and limit",
			queryString:  "?page=3&limit=50",
			defaultLimit: 10,
			expectPage:   3,
			expectLimit:  50,
		},
		{
			name:         "Invalid values fallback to defaults",
			queryString:  "?page=-1&limit=0",
			defaultLimit: 15,
			expectPage:   1,
			expectLimit:  15,
		},
		{
			name:         "Limit exceeding upper bound (500) clamps to default",
			queryString:  "?page=1&limit=1000000",
			defaultLimit: 25,
			expectPage:   1,
			expectLimit:  25,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			req, _ := http.NewRequest(http.MethodGet, "/test"+tt.queryString, nil)
			c.Request = req

			page, limit := ParsePagination(c, tt.defaultLimit)
			if page != tt.expectPage {
				t.Errorf("ParsePagination() page = %v, want %v", page, tt.expectPage)
			}
			if limit != tt.expectLimit {
				t.Errorf("ParsePagination() limit = %v, want %v", limit, tt.expectLimit)
			}
		})
	}
}

func TestHandleDomainError(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		err          error
		expectCode   int
		expectCodeStr string
	}{
		{
			name:         "Duplicate key error (MySQL 1062)",
			err:          errors.New("Error 1062: Duplicate entry 'admin' for key 'users.username'"),
			expectCode:   http.StatusConflict,
			expectCodeStr: "CONFLICT",
		},
		{
			name:         "Foreign key violation (MySQL 1452)",
			err:          errors.New("Error 1452: Cannot add or update a child row: a foreign key constraint fails"),
			expectCode:   http.StatusBadRequest,
			expectCodeStr: "INVALID_REFERENCE",
		},
		{
			name:         "Record not found error",
			err:          sql.ErrNoRows,
			expectCode:   http.StatusNotFound,
			expectCodeStr: "NOT_FOUND",
		},
		{
			name:         "Domain delete self constraint",
			err:          errors.New("anda tidak bisa menghapus akun anda sendiri"),
			expectCode:   http.StatusBadRequest,
			expectCodeStr: "DELETE_FAILED",
		},
		{
			name:         "Generic internal error",
			err:          errors.New("unexpected database connection pool timeout"),
			expectCode:   http.StatusInternalServerError,
			expectCodeStr: "INTERNAL_ERROR",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			HandleDomainError(c, tt.err)

			if w.Code != tt.expectCode {
				t.Errorf("HandleDomainError() status = %d, want %d", w.Code, tt.expectCode)
			}
		})
	}
}

func setupI18nMockForUtils() {
	i18n.RegisterLookupHook(func(ctx context.Context, locale, key string) (string, bool) {
		if locale == "en-US" {
			switch key {
			case "errors.forbidden":
				return "Access is forbidden", true
			case "errors.validation_error":
				return "Validation failed", true
			case "inventory.stock_insufficient":
				return "Insufficient stock for {sku} (only {available} left)", true
			}
		}
		return "", false
	})
}

func TestErrorResponse_Localization(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupI18nMockForUtils()

	t.Run("Translates FORBIDDEN error code when locale is en-US", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set(i18n.GinLocaleKey, "en-US")

		ErrorResponse(c, http.StatusForbidden, "Akses ditolak", "FORBIDDEN")

		if w.Code != http.StatusForbidden {
			t.Errorf("expected status %d, got %d", http.StatusForbidden, w.Code)
		}

		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json response: %v", err)
		}

		if resp["success"] != false {
			t.Errorf("expected success false, got %v", resp["success"])
		}
		if resp["error_code"] != "FORBIDDEN" {
			t.Errorf("expected error_code FORBIDDEN, got %v", resp["error_code"])
		}
		if resp["message"] != "Access is forbidden" {
			t.Errorf("expected translated message 'Access is forbidden', got %v", resp["message"])
		}
	})

	t.Run("Preserves original message when locale is id-ID", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set(i18n.GinLocaleKey, "id-ID")

		ErrorResponse(c, http.StatusForbidden, "Akses ditolak", "FORBIDDEN")

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		if resp["message"] != "Akses ditolak" {
			t.Errorf("expected original message 'Akses ditolak', got %v", resp["message"])
		}
	})

	t.Run("Falls back to original message when translation key is not found in en-US", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set(i18n.GinLocaleKey, "en-US")

		ErrorResponse(c, http.StatusBadRequest, "Custom unmapped business error", "CUSTOM_UNKNOWN_CODE")

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		if resp["message"] != "Custom unmapped business error" {
			t.Errorf("expected fallback message 'Custom unmapped business error', got %v", resp["message"])
		}
	})
}

func TestLocalizedError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupI18nMockForUtils()

	t.Run("Interpolates parameters correctly with en-US locale", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Set(i18n.GinLocaleKey, "en-US")

		LocalizedError(c, http.StatusBadRequest, "inventory.stock_insufficient", map[string]any{
			"sku":       "SKU-999",
			"available": 3,
		}, "STOCK_INSUFFICIENT")

		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse json response: %v", err)
		}

		expected := "Insufficient stock for SKU-999 (only 3 left)"
		if resp["message"] != expected {
			t.Errorf("expected message %q, got %q", expected, resp["message"])
		}
		if resp["error_code"] != "STOCK_INSUFFICIENT" {
			t.Errorf("expected error_code STOCK_INSUFFICIENT, got %v", resp["error_code"])
		}
	})
}

type testSampleReq struct {
	Name string `json:"name" binding:"required"`
}

func TestBindAndValidate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupI18nMockForUtils()

	t.Run("Returns localized validation error prefix for en-US", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req
		c.Set(i18n.GinLocaleKey, "en-US")

		val, ok := BindAndValidate[testSampleReq](c)
		if ok {
			t.Errorf("expected BindAndValidate to fail, but succeeded with %+v", val)
		}
		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d", w.Code)
		}

		var resp map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		msg, _ := resp["message"].(string)
		if !strings.HasPrefix(msg, "Validation failed:") {
			t.Errorf("expected message prefix 'Validation failed:', got %q", msg)
		}
	})

	t.Run("Succeeds when payload is valid", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(`{"name":"test-item"}`))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req

		val, ok := BindAndValidate[testSampleReq](c)
		if !ok || val == nil {
			t.Fatalf("expected BindAndValidate to succeed, got ok=%v, val=%v", ok, val)
		}
		if val.Name != "test-item" {
			t.Errorf("expected Name 'test-item', got %q", val.Name)
		}
	})
}

func TestJobCreatedResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	JobCreatedResponse(c, http.StatusAccepted, "Job created successfully", 42)

	if w.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, w.Code)
	}

	var body struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
		JobID   int    `json:"jobId"`
		Data    struct {
			JobIDUpper int `json:"jobId"`
			JobIDSnake int `json:"job_id"`
		} `json:"data"`
	}

	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if !body.Success {
		t.Errorf("expected success true, got false")
	}
	if body.Message != "Job created successfully" {
		t.Errorf("expected message 'Job created successfully', got %q", body.Message)
	}
	if body.JobID != 42 {
		t.Errorf("expected root jobId 42, got %d", body.JobID)
	}
	if body.Data.JobIDUpper != 42 || body.Data.JobIDSnake != 42 {
		t.Errorf("expected data.jobId and data.job_id to be 42, got upper=%d, snake=%d", body.Data.JobIDUpper, body.Data.JobIDSnake)
	}
}

