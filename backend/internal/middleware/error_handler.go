package middleware

import (
	"net/http"

	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
)

// GlobalErrorHandler menangkap panic (recovery) dan memastikan response berbentuk JSON.
func GlobalErrorHandler() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Terjadi kesalahan internal pada server.", "SERVER_ERROR")
		c.Abort()
	})
}
