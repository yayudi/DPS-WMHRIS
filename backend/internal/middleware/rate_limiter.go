package middleware

import (
	"net/http"
	"sync"

	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

var (
	// visitors menyimpan limiter untuk masing-masing IP address
	visitors = make(map[string]*rate.Limiter)
	mu       sync.Mutex
)

// getVisitor mengambil limiter dari map atau membuat baru jika belum ada
func getVisitor(ip string, r rate.Limit, b int) *rate.Limiter {
	mu.Lock()
	defer mu.Unlock()

	limiter, exists := visitors[ip]
	if !exists {
		// r = jumlah request yang diizinkan per detik (refill rate)
		// b = batas maksimal request bersamaan (burst)
		limiter = rate.NewLimiter(r, b)
		visitors[ip] = limiter
	}

	return limiter
}

// RateLimiter membatasi jumlah request menggunakan algoritma Token Bucket (Per-IP)
func RateLimiter(requestsPerSecond float64, burst int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := getVisitor(ip, rate.Limit(requestsPerSecond), burst)

		// Tolak jika token habis
		if !limiter.Allow() {
			utils.ErrorResponse(c, http.StatusTooManyRequests, "Too many requests. Please try again later.", "RATE_LIMIT_EXCEEDED")
			c.Abort()
			return
		}

		c.Next()
	}
}
