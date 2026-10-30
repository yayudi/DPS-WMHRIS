package utils

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
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

