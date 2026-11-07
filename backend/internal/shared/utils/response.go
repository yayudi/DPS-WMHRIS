package utils

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
)

// SuccessResponse mengirimkan respons JSON standar untuk operasi yang berhasil.
func SuccessResponse(c *gin.Context, statusCode int, message string, data any) {
	response := gin.H{
		"success": true,
		"message": message,
	}
	if data != nil {
		response["data"] = data
	}
	c.JSON(statusCode, response)
}

// JobCreatedResponse mengirimkan respons JSON terstandar untuk pembuatan background job (import/export)
// yang kompatibel dengan seluruh variasi pembacaan di frontend (top-level jobId, data.jobId, dan data.job_id).
func JobCreatedResponse(c *gin.Context, statusCode int, message string, jobID int) {
	c.JSON(statusCode, gin.H{
		"success": true,
		"message": message,
		"jobId":   jobID,
		"data": gin.H{
			"jobId":  jobID,
			"job_id": jobID,
		},
	})
}

// ErrorResponse mengirimkan respons JSON standar untuk operasi yang gagal.
// Mendukung resolusi otomatis ke kamus "errors.*" jika locale aktif bukan default (id-ID).
func ErrorResponse(c *gin.Context, statusCode int, message string, errorCode string) {
	locale := c.GetString(i18n.GinLocaleKey)
	if locale == "" && c.Request != nil {
		locale = i18n.GetLocaleFromContext(c.Request.Context())
	}
	var ctx context.Context
	if c.Request != nil {
		ctx = c.Request.Context()
	} else {
		ctx = context.Background()
	}
	resolvedMsg := i18n.TranslateErrorCode(ctx, locale, errorCode, message)

	c.JSON(statusCode, gin.H{
		"success":    false,
		"message":    resolvedMsg,
		"error_code": errorCode,
	})
}

// LocalizedError mengirimkan respons error dengan key terjemahan custom dan interpolasi parameter dinamis.
func LocalizedError(c *gin.Context, statusCode int, i18nKey string, params map[string]any, errorCode string) {
	locale := c.GetString(i18n.GinLocaleKey)
	if locale == "" && c.Request != nil {
		locale = i18n.GetLocaleFromContext(c.Request.Context())
	}
	var ctx context.Context
	if c.Request != nil {
		ctx = c.Request.Context()
	} else {
		ctx = context.Background()
	}
	msg := i18n.TranslateByLocale(ctx, locale, i18nKey, params)

	c.JSON(statusCode, gin.H{
		"success":    false,
		"message":    msg,
		"error_code": errorCode,
	})
}

// BindAndValidate mencoba melakukan binding JSON ke struct generik.
// Mengembalikan true jika berhasil, atau false (beserta respons error otomatis) jika gagal.
func BindAndValidate[T any](c *gin.Context) (*T, bool) {
	var req T
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrorResponse(c, http.StatusBadRequest, fmt.Sprintf("Format input tidak valid: %s", err.Error()), "VALIDATION_ERROR")
		return nil, false
	}
	return &req, true
}

// BindQueryAndValidate mencoba melakukan binding Query Param ke struct generik.
func BindQueryAndValidate[T any](c *gin.Context) (*T, bool) {
	var req T
	if err := c.ShouldBindQuery(&req); err != nil {
		ErrorResponse(c, http.StatusBadRequest, fmt.Sprintf("Parameter tidak valid: %s", err.Error()), "VALIDATION_ERROR")
		return nil, false
	}
	return &req, true
}

// SuccessDataResponse mengirimkan respons JSON sukses tanpa pesan (hanya data).
func SuccessDataResponse(c *gin.Context, statusCode int, data any) {
	c.JSON(statusCode, gin.H{
		"success": true,
		"data":    data,
	})
}

// RawResponse mengirimkan respons data mentah (tanpa pembungkus standar).
func RawResponse(c *gin.Context, statusCode int, data any) {
	c.JSON(statusCode, data)
}

func PaginatedResponse(c *gin.Context, statusCode int, data any, page int, limit int, total int, totalPages int) {
	c.JSON(statusCode, gin.H{
		"success": true,
		"data":    data,
		"pagination": gin.H{
			"page":        page,
			"limit":       limit,
			"total":       total,
			"total_pages": totalPages,
		},
	})
}

// ParseIntParam membaca path parameter berupa integer dari URL.
// Mengembalikan nilai integer dan true jika valid, atau 0 dan false (beserta response 400 otomatis) jika gagal.
func ParseIntParam(c *gin.Context, paramName string) (int, bool) {
	valStr := c.Param(paramName)
	if valStr == "" {
		ErrorResponse(c, http.StatusBadRequest, fmt.Sprintf("Parameter '%s' wajib diisi", paramName), "VALIDATION_ERROR")
		return 0, false
	}
	val, err := strconv.Atoi(valStr)
	if err != nil {
		ErrorResponse(c, http.StatusBadRequest, fmt.Sprintf("Parameter '%s' harus berupa angka bulat valid", paramName), "VALIDATION_ERROR")
		return 0, false
	}
	return val, true
}

// ParsePagination membaca query parameter page dan limit dengan fallback default values serta batas atas aman (max 500).
func ParsePagination(c *gin.Context, defaultLimit int) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}

	const maxPageLimit = 500
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", strconv.Itoa(defaultLimit)))
	if limit < 1 || limit > maxPageLimit {
		limit = defaultLimit
	}
	return page, limit
}

// HandleDomainError memetakan domain & database error ke HTTP response standar:
// - MySQL 1062 (Duplicate Key) -> 409 Conflict, code: CONFLICT
// - MySQL 1452 (Foreign Key Constraint) -> 400 Bad Request, code: INVALID_REFERENCE
// - sql.ErrNoRows / "tidak ditemukan" -> 404 Not Found, code: NOT_FOUND
// - Aturan validasi domain spesifik -> 400 Bad Request
// - Fallback default -> 500 Internal Server Error, code: INTERNAL_ERROR
func HandleDomainError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	errStr := err.Error()
	errLower := strings.ToLower(errStr)

	if database.IsDuplicateKey(err) || strings.Contains(errLower, "1062") || strings.Contains(errLower, "duplicate") {
		msg := "Data duplikat atau sudah digunakan."
		if strings.Contains(errLower, "username") {
			msg = "Username sudah digunakan."
		}
		ErrorResponse(c, http.StatusConflict, msg, "CONFLICT")
		return
	}

	if database.IsForeignKeyViolation(err) || strings.Contains(errLower, "1452") || strings.Contains(errLower, "foreign key") {
		msg := "Satu atau lebih referensi data tidak valid."
		if strings.Contains(errLower, "lokasi") {
			msg = "Satu atau lebih ID lokasi tidak valid."
		}
		ErrorResponse(c, http.StatusBadRequest, msg, "INVALID_REFERENCE")
		return
	}

	if errors.Is(err, sql.ErrNoRows) || strings.Contains(errLower, "tidak ditemukan") || strings.Contains(errLower, "not found") {
		ErrorResponse(c, http.StatusNotFound, errStr, "NOT_FOUND")
		return
	}

	if strings.Contains(errLower, "tidak bisa menghapus") || strings.Contains(errLower, "cannot delete") {
		ErrorResponse(c, http.StatusBadRequest, errStr, "DELETE_FAILED")
		return
	}

	ErrorResponse(c, http.StatusInternalServerError, errStr, "INTERNAL_ERROR")
}
