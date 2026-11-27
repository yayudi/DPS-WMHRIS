package middleware

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type mockPermissionDB struct {
	calls   int
	getFunc func(ctx context.Context, dest any, query string, args ...any) error
}

func (m *mockPermissionDB) GetContext(ctx context.Context, dest any, query string, args ...any) error {
	m.calls++
	return m.getFunc(ctx, dest, query, args...)
}

func TestRequireAnyPermission_CachingAndTransientDBErrorSafety(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("superadmin roleID=1 bypasses DB query", func(t *testing.T) {
		ClearAllPermissionCache()
		db := &mockPermissionDB{
			getFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				t.Fatal("DB should not be queried for superadmin")
				return nil
			},
		}

		r := gin.New()
		r.Use(func(c *gin.Context) {
			c.Set(ContextRoleIDKey, 1)
			c.Next()
		})
		r.GET("/admin", RequirePermission(db, "role.manage"), func(c *gin.Context) {
			c.Status(http.StatusOK)
		})

		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/admin", nil))
		if w.Code != http.StatusOK || db.calls != 0 {
			t.Fatalf("expected 200 with 0 DB calls, got code=%d calls=%d", w.Code, db.calls)
		}
	})

	t.Run("does NOT cache false on transient DB error and succeeds once DB recovers", func(t *testing.T) {
		ClearAllPermissionCache()
		shouldFailTransiently := true
		db := &mockPermissionDB{
			getFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				if shouldFailTransiently {
					return errors.New("driver: bad connection")
				}
				if ptr, ok := dest.(*int); ok {
					*ptr = 1
				}
				return nil
			},
		}

		r := gin.New()
		r.Use(func(c *gin.Context) {
			c.Set(ContextRoleIDKey, 5)
			c.Next()
		})
		r.GET("/stock", RequirePermission(db, "stock.manage"), func(c *gin.Context) {
			c.Status(http.StatusOK)
		})

		// 1st call fails due to transient DB connection error -> 403, but MUST NOT cache false
		w1 := httptest.NewRecorder()
		r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/stock", nil))
		if w1.Code != http.StatusForbidden {
			t.Fatalf("expected 403 on transient DB failure, got %d", w1.Code)
		}

		// 2nd call: DB recovers -> must query DB again, succeed (200), and cache true
		shouldFailTransiently = false
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/stock", nil))
		if w2.Code != http.StatusOK {
			t.Fatalf("expected 200 after DB recovery (false must not be cached on DB error), got %d", w2.Code)
		}

		// 3rd call: served from in-memory cache without hitting DB again
		callsBeforeThird := db.calls
		w3 := httptest.NewRecorder()
		r.ServeHTTP(w3, httptest.NewRequest(http.MethodGet, "/stock", nil))
		if w3.Code != http.StatusOK || db.calls != callsBeforeThird {
			t.Fatalf("expected cached 200 with no extra DB call, got code=%d calls=%d", w3.Code, db.calls)
		}
	})

	t.Run("caches negative result when sql.ErrNoRows is returned and clears via ClearPermissionCache", func(t *testing.T) {
		ClearAllPermissionCache()
		db := &mockPermissionDB{
			getFunc: func(ctx context.Context, dest any, query string, args ...any) error {
				return sql.ErrNoRows
			},
		}

		r := gin.New()
		r.Use(func(c *gin.Context) {
			c.Set(ContextRoleIDKey, 9)
			c.Next()
		})
		r.GET("/reports", RequirePermission(db, "report.view"), func(c *gin.Context) {
			c.Status(http.StatusOK)
		})

		w1 := httptest.NewRecorder()
		r.ServeHTTP(w1, httptest.NewRequest(http.MethodGet, "/reports", nil))
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, httptest.NewRequest(http.MethodGet, "/reports", nil))

		if w1.Code != http.StatusForbidden || w2.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d and %d", w1.Code, w2.Code)
		}
		if db.calls != 1 {
			t.Fatalf("expected sql.ErrNoRows to be cached (1 DB call), got %d calls", db.calls)
		}

		ClearPermissionCache(9)
		w3 := httptest.NewRecorder()
		r.ServeHTTP(w3, httptest.NewRequest(http.MethodGet, "/reports", nil))
		if db.calls != 2 {
			t.Fatalf("expected cache invalidation to trigger re-query (2 DB calls), got %d", db.calls)
		}
	})
}

func TestRateLimiter_EnforcesBurstAndEvictsStaleVisitors(t *testing.T) {
	gin.SetMode(gin.TestMode)

	mu.Lock()
	visitors = make(map[string]*visitorEntry)
	lastCleanup = time.Time{}
	mu.Unlock()

	t0 := time.Now()
	_ = getVisitorAt("10.0.0.1", rate.Limit(1), 1, t0)
	_ = getVisitorAt("10.0.0.2", rate.Limit(1), 1, t0.Add(8*time.Minute))

	// Advance past visitorTTL (10m) for 10.0.0.1 and past visitorCleanupPeriod (5m) since t0+8m
	_ = getVisitorAt("10.0.0.3", rate.Limit(1), 1, t0.Add(14*time.Minute))

	mu.Lock()
	_, hasStale := visitors["10.0.0.1"]
	_, hasFresh2 := visitors["10.0.0.2"]
	_, hasFresh3 := visitors["10.0.0.3"]
	mu.Unlock()

	if hasStale {
		t.Error("expected stale visitor 10.0.0.1 to be evicted after TTL")
	}
	if !hasFresh2 || !hasFresh3 {
		t.Error("expected active visitors 10.0.0.2 and 10.0.0.3 to remain in map")
	}

	// Test HTTP 429 enforcement
	r := gin.New()
	r.Use(RateLimiter(1, 1))
	r.GET("/limited", func(c *gin.Context) { c.Status(http.StatusOK) })

	req1 := httptest.NewRequest(http.MethodGet, "/limited", nil)
	req1.RemoteAddr = "192.168.1.50:12345"
	w1 := httptest.NewRecorder()
	r.ServeHTTP(w1, req1)

	req2 := httptest.NewRequest(http.MethodGet, "/limited", nil)
	req2.RemoteAddr = "192.168.1.50:12345"
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w1.Code != http.StatusOK || w2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 200 then 429, got %d then %d", w1.Code, w2.Code)
	}
}

func TestGlobalErrorHandler_RecoversPanicTo500JSON(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(GlobalErrorHandler())
	r.GET("/boom", func(c *gin.Context) {
		panic("simulated nil pointer dereference")
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/boom", nil))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 on panic recovery, got %d", w.Code)
	}
}
