package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

func setupTestRouter(preHandler func(c *gin.Context)) (*gin.Engine, *string, *string) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	var capturedGinLocale string
	var capturedCtxLocale string

	if preHandler != nil {
		r.Use(preHandler)
	}
	r.Use(middleware.LocaleContextMiddleware())

	r.GET("/test-locale", func(c *gin.Context) {
		capturedGinLocale = middleware.GetLocale(c)
		capturedCtxLocale = middleware.GetLocaleFromContext(c.Request.Context())
		c.Status(http.StatusOK)
	})

	return r, &capturedGinLocale, &capturedCtxLocale
}

func TestLocaleContextMiddleware_Priorities(t *testing.T) {
	t.Run("Priority 1: X-User-Locale Header overrides all", func(t *testing.T) {
		r, ginLoc, ctxLoc := setupTestRouter(func(c *gin.Context) {
			// Simulate JWT claims setting locale to id-ID
			c.Set(middleware.GinLocaleKey, "id-ID")
		})

		req := httptest.NewRequest(http.MethodGet, "/test-locale", nil)
		req.Header.Set("X-User-Locale", "en-US")
		req.Header.Set("Accept-Language", "id-ID,id;q=0.9")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if *ginLoc != "en-US" || *ctxLoc != "en-US" {
			t.Errorf("expected en-US, got gin=%s ctx=%s", *ginLoc, *ctxLoc)
		}
	})

	t.Run("Priority 2: Context / Token claims when no X-User-Locale", func(t *testing.T) {
		r, ginLoc, ctxLoc := setupTestRouter(func(c *gin.Context) {
			c.Set(middleware.GinLocaleKey, "en-US")
		})

		req := httptest.NewRequest(http.MethodGet, "/test-locale", nil)
		req.Header.Set("Accept-Language", "id-ID,id;q=0.9")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if *ginLoc != "en-US" || *ctxLoc != "en-US" {
			t.Errorf("expected en-US from context, got gin=%s ctx=%s", *ginLoc, *ctxLoc)
		}
	})

	t.Run("Priority 3: Accept-Language for guest request", func(t *testing.T) {
		r, ginLoc, ctxLoc := setupTestRouter(nil)

		req := httptest.NewRequest(http.MethodGet, "/test-locale", nil)
		req.Header.Set("Accept-Language", "en-GB,en;q=0.8,id;q=0.5")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if *ginLoc != "en-US" || *ctxLoc != "en-US" {
			t.Errorf("expected normalized en-US from Accept-Language, got gin=%s ctx=%s", *ginLoc, *ctxLoc)
		}
	})

	t.Run("Priority 4: Default fallback id-ID when no headers or context", func(t *testing.T) {
		r, ginLoc, ctxLoc := setupTestRouter(nil)

		req := httptest.NewRequest(http.MethodGet, "/test-locale", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if *ginLoc != "id-ID" || *ctxLoc != "id-ID" {
			t.Errorf("expected default id-ID, got gin=%s ctx=%s", *ginLoc, *ctxLoc)
		}
	})

	t.Run("Real-World AuthMiddleware Flow: X-User-Locale wins over JWT claims", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		r := gin.New()

		// Global middleware as in main.go
		r.Use(middleware.LocaleContextMiddleware())

		var capturedGinLocale string
		var capturedCtxLocale string

		// Protected group simulating AuthMiddleware execution order
		protected := r.Group("/protected")
		protected.Use(func(c *gin.Context) {
			// Simulate AuthMiddleware parsing JWT token with locale = id-ID
			c.Set(middleware.GinJWTLocaleKey, "id-ID")
			middleware.ApplyResolvedLocale(c)
			c.Next()
		})
		protected.GET("/resource", func(c *gin.Context) {
			capturedGinLocale = middleware.GetLocale(c)
			capturedCtxLocale = middleware.GetLocaleFromContext(c.Request.Context())
			c.Status(http.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/protected/resource", nil)
		req.Header.Set("X-User-Locale", "en-US")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if capturedGinLocale != "en-US" || capturedCtxLocale != "en-US" {
			t.Errorf("expected en-US (header priority), got gin=%s ctx=%s", capturedGinLocale, capturedCtxLocale)
		}
	})

	t.Run("Real-World AuthMiddleware Flow: JWT claim updates context when no X-User-Locale header", func(t *testing.T) {
		gin.SetMode(gin.TestMode)
		r := gin.New()

		// Global middleware as in main.go
		r.Use(middleware.LocaleContextMiddleware())

		var capturedGinLocale string
		var capturedCtxLocale string

		protected := r.Group("/protected")
		protected.Use(func(c *gin.Context) {
			// Simulate AuthMiddleware parsing JWT token with locale = en-US
			c.Set(middleware.GinJWTLocaleKey, "en-US")
			middleware.ApplyResolvedLocale(c)
			c.Next()
		})
		protected.GET("/resource", func(c *gin.Context) {
			capturedGinLocale = middleware.GetLocale(c)
			capturedCtxLocale = middleware.GetLocaleFromContext(c.Request.Context())
			c.Status(http.StatusOK)
		})

		// Guest / no X-User-Locale
		req := httptest.NewRequest(http.MethodGet, "/protected/resource", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if capturedGinLocale != "en-US" || capturedCtxLocale != "en-US" {
			t.Errorf("expected en-US (from JWT claim), got gin=%s ctx=%s", capturedGinLocale, capturedCtxLocale)
		}
	})

	t.Run("Dynamic locale registration allows new language", func(t *testing.T) {
		r, ginLoc, ctxLoc := setupTestRouter(nil)

		// Before registration, de-DE should fallback to id-ID
		req1 := httptest.NewRequest(http.MethodGet, "/test-locale", nil)
		req1.Header.Set("X-User-Locale", "de-DE")
		w1 := httptest.NewRecorder()
		r.ServeHTTP(w1, req1)
		if *ginLoc != "id-ID" {
			t.Errorf("expected id-ID before registration, got %s", *ginLoc)
		}

		// Register de-DE dynamically
		i18n.RegisterSupportedLocales([]string{"id-ID", "en-US", "de-DE"})

		// Now de-DE must be recognized
		req2 := httptest.NewRequest(http.MethodGet, "/test-locale", nil)
		req2.Header.Set("X-User-Locale", "de-DE")
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, req2)
		if *ginLoc != "de-DE" || *ctxLoc != "de-DE" {
			t.Errorf("expected de-DE after dynamic registration, got gin=%s ctx=%s", *ginLoc, *ctxLoc)
		}
	})
}

