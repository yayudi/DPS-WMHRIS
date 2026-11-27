package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

const (
	visitorTTL            = 10 * time.Minute
	visitorCleanupPeriod  = 5 * time.Minute
	maxVisitorsBeforeScan = 2048
)

type visitorEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

var (
	visitors    = make(map[string]*visitorEntry)
	lastCleanup time.Time
	mu          sync.Mutex
)

// getVisitorAt retrieves or creates a per-IP rate limiter and evicts stale entries older than visitorTTL.
func getVisitorAt(ip string, r rate.Limit, b int, now time.Time) *rate.Limiter {
	mu.Lock()
	defer mu.Unlock()

	if lastCleanup.IsZero() {
		lastCleanup = now
	} else if now.Sub(lastCleanup) >= visitorCleanupPeriod || len(visitors) >= maxVisitorsBeforeScan {
		for k, v := range visitors {
			if now.Sub(v.lastSeen) > visitorTTL {
				delete(visitors, k)
			}
		}
		lastCleanup = now
	}

	entry, exists := visitors[ip]
	if !exists {
		entry = &visitorEntry{
			limiter:  rate.NewLimiter(r, b),
			lastSeen: now,
		}
		visitors[ip] = entry
		return entry.limiter
	}

	entry.lastSeen = now
	return entry.limiter
}

// RateLimiter restricts request frequency per client IP using a Token Bucket algorithm with TTL eviction.
func RateLimiter(requestsPerSecond float64, burst int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := getVisitorAt(ip, rate.Limit(requestsPerSecond), burst, time.Now())

		if !limiter.Allow() {
			utils.LocalizedError(c, http.StatusTooManyRequests, "errors.rate_limit_exceeded", nil, "RATE_LIMIT_EXCEEDED")
			c.Abort()
			return
		}

		c.Next()
	}
}
