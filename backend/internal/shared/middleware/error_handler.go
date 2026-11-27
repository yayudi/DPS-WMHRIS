package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
)

// GlobalErrorHandler intercepts unhandled panics, logs the stack trace, and returns a standardized 500 JSON envelope.
func GlobalErrorHandler() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered any) {
		path := ""
		method := ""
		if c.Request != nil {
			method = c.Request.Method
			if c.Request.URL != nil {
				path = c.Request.URL.Path
			}
		}
		log.Printf("[PANIC RECOVERED] %s %s: %v\n%s", method, path, recovered, debug.Stack())
		utils.LocalizedError(c, http.StatusInternalServerError, "errors.server_error", nil, "SERVER_ERROR")
		c.Abort()
	})
}
