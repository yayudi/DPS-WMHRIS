package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestInternalAPIKeyMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("enforces header when key is configured", func(t *testing.T) {
		r := gin.New()
		r.GET("/internal", InternalAPIKeyMiddleware("super-secret-key", "X-API-Key"), func(c *gin.Context) {
			c.String(http.StatusOK, "ok")
		})

		// Missing key
		wMissing := httptest.NewRecorder()
		r.ServeHTTP(wMissing, httptest.NewRequest(http.MethodGet, "/internal", nil))
		if wMissing.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 when header missing, got %d", wMissing.Code)
		}

		// Wrong key
		reqWrong := httptest.NewRequest(http.MethodGet, "/internal", nil)
		reqWrong.Header.Set("X-API-Key", "wrong-key")
		wWrong := httptest.NewRecorder()
		r.ServeHTTP(wWrong, reqWrong)
		if wWrong.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 when key invalid, got %d", wWrong.Code)
		}

		// Valid key
		reqValid := httptest.NewRequest(http.MethodGet, "/internal", nil)
		reqValid.Header.Set("X-API-Key", "super-secret-key")
		wValid := httptest.NewRecorder()
		r.ServeHTTP(wValid, reqValid)
		if wValid.Code != http.StatusOK {
			t.Fatalf("expected 200 when key valid, got %d", wValid.Code)
		}
	})

	t.Run("allows requests in permissive mode when key is empty", func(t *testing.T) {
		r := gin.New()
		r.GET("/internal", InternalAPIKeyMiddleware("", "X-API-Key"), func(c *gin.Context) {
			c.String(http.StatusOK, "ok")
		})

		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/internal", nil))
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 in permissive mode, got %d", w.Code)
		}
	})
}
