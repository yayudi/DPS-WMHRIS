package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSMiddleware_ExplicitAllowlist(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(CORSMiddleware([]string{"https://wms.example.com/", "*"}, "production"))
	r.GET("/ping", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	t.Run("allows configured origin with credentials", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/ping", nil)
		req.Header.Set("Origin", "https://wms.example.com")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://wms.example.com" {
			t.Fatalf("expected allow-origin https://wms.example.com, got %q", got)
		}
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
			t.Fatalf("expected allow-credentials true, got %q", got)
		}
		if got := w.Header().Get("Vary"); got != "Origin" {
			t.Fatalf("expected Vary Origin, got %q", got)
		}
	})

	t.Run("rejects untrusted origin on preflight and omits allow-origin header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/ping", nil)
		req.Header.Set("Origin", "https://evil.example.com")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("expected empty allow-origin, got %q", got)
		}
	})

	t.Run("does not emit wildcard with credentials when Origin header is absent", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/ping", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("expected empty allow-origin, got %q", got)
		}
		if got := w.Header().Get("Access-Control-Allow-Credentials"); got != "" {
			t.Fatalf("expected empty allow-credentials, got %q", got)
		}
	})
}

func TestCORSMiddleware_EmptyAllowlistFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("development allows localhost but blocks external origins", func(t *testing.T) {
		r := gin.New()
		r.Use(CORSMiddleware(nil, "development"))
		r.GET("/ping", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

		reqLocal := httptest.NewRequest(http.MethodOptions, "/ping", nil)
		reqLocal.Header.Set("Origin", "http://localhost:5173")
		wLocal := httptest.NewRecorder()
		r.ServeHTTP(wLocal, reqLocal)
		if wLocal.Code != http.StatusNoContent {
			t.Fatalf("expected 204 for localhost in dev, got %d", wLocal.Code)
		}
		if got := wLocal.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
			t.Fatalf("expected localhost allow-origin, got %q", got)
		}

		reqEvil := httptest.NewRequest(http.MethodOptions, "/ping", nil)
		reqEvil.Header.Set("Origin", "https://attacker.tld")
		wEvil := httptest.NewRecorder()
		r.ServeHTTP(wEvil, reqEvil)
		if wEvil.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for untrusted origin in dev, got %d", wEvil.Code)
		}
	})

	t.Run("production blocks localhost when allowlist is empty", func(t *testing.T) {
		r := gin.New()
		r.Use(CORSMiddleware(nil, "production"))
		r.GET("/ping", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

		req := httptest.NewRequest(http.MethodOptions, "/ping", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 in production without allowlist, got %d", w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("expected empty allow-origin, got %q", got)
		}
	})
}
