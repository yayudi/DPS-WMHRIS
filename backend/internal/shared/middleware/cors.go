package middleware

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORSMiddleware enforces an explicit origin allowlist for cross-origin requests.
// When allowedOrigins is empty, localhost/127.0.0.1 origins are allowed in non-production
// environments, while production rejects cross-origin browser requests without reflecting
// untrusted origins or pairing wildcard origins with credentials.
func CORSMiddleware(allowedOrigins []string, env string) gin.HandlerFunc {
	allowSet := make(map[string]struct{}, len(allowedOrigins))
	for _, raw := range allowedOrigins {
		normalized := normalizeOrigin(raw)
		if normalized == "" || normalized == "*" {
			continue
		}
		allowSet[normalized] = struct{}{}
	}

	isProduction := strings.EqualFold(strings.TrimSpace(env), "production")
	if len(allowSet) == 0 && isProduction {
		log.Println("[SECURITY WARN] CORS_ALLOWED_ORIGINS is empty in production; cross-origin browser requests will be rejected")
	}

	return func(c *gin.Context) {
		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if origin == "" {
			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusNoContent)
				return
			}
			c.Next()
			return
		}

		c.Writer.Header().Add("Vary", "Origin")

		normalized := normalizeOrigin(origin)
		allowed := false
		if len(allowSet) > 0 {
			_, allowed = allowSet[normalized]
		} else if !isProduction {
			allowed = isLocalDevOrigin(normalized)
		}

		if !allowed {
			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			c.Next()
			return
		}

		c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-User-Locale, If-None-Match")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "ETag")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func normalizeOrigin(origin string) string {
	return strings.TrimRight(strings.TrimSpace(origin), "/")
}

func isLocalDevOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "localhost" || host == "127.0.0.1"
}
