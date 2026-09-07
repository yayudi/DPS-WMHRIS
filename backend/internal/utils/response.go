package utils

import (
	"net/http"

	"github.com/gin-gonic/gin"
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

// ErrorResponse mengirimkan respons JSON standar untuk operasi yang gagal.
func ErrorResponse(c *gin.Context, statusCode int, message string, errorCode string) {
	c.JSON(statusCode, gin.H{
		"success":    false,
		"message":    message,
		"error_code": errorCode,
	})
}

// BindAndValidate mencoba melakukan binding JSON ke struct generik. 
// Mengembalikan true jika berhasil, atau false (beserta respons error otomatis) jika gagal.
func BindAndValidate[T any](c *gin.Context) (*T, bool) {
	var req T
	if err := c.ShouldBindJSON(&req); err != nil {
		ErrorResponse(c, http.StatusBadRequest, "Format input tidak valid: "+err.Error(), "VALIDATION_ERROR")
		return nil, false
	}
	return &req, true
}

// BindQueryAndValidate mencoba melakukan binding Query Param ke struct generik.
func BindQueryAndValidate[T any](c *gin.Context) (*T, bool) {
	var req T
	if err := c.ShouldBindQuery(&req); err != nil {
		ErrorResponse(c, http.StatusBadRequest, "Parameter tidak valid: "+err.Error(), "VALIDATION_ERROR")
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
			"page":       page,
			"limit":      limit,
			"total":      total,
			"total_pages": totalPages,
		},
	})
}
