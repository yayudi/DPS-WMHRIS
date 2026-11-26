package middleware

import (
	"crypto/subtle"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// InternalAPIKeyMiddleware protects internal service-to-service endpoints (e.g., Kelja ERP)
// using a constant-time comparison against the configured API key header.
// If expectedKey is empty, a startup warning is logged and requests are allowed through so
// existing live integrations are not disrupted prior to secret rollout.
func InternalAPIKeyMiddleware(expectedKey string, headerName string) gin.HandlerFunc {
	trimmedKey := strings.TrimSpace(expectedKey)
	if headerName == "" {
		headerName = "X-API-Key"
	}

	if trimmedKey == "" {
		log.Printf("[SECURITY WARN] Internal API key is not configured for header %s; protected internal route is currently running in permissive mode", headerName)
		return func(c *gin.Context) {
			c.Next()
		}
	}

	expectedBytes := []byte(trimmedKey)

	return func(c *gin.Context) {
		provided := strings.TrimSpace(c.GetHeader(headerName))
		if len(provided) != len(expectedBytes) || subtle.ConstantTimeCompare([]byte(provided), expectedBytes) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"success":    false,
				"message":    "Invalid or missing API key",
				"error_code": "UNAUTHORIZED",
			})
			return
		}
		c.Next()
	}
}
