package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestGetUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name     string
		setup    func(c *gin.Context)
		expected int
	}{
		{
			name: "Integer user_id",
			setup: func(c *gin.Context) {
				c.Set(ContextUserIDKey, 42)
			},
			expected: 42,
		},
		{
			name: "Float64 user_id",
			setup: func(c *gin.Context) {
				c.Set(ContextUserIDKey, float64(99))
			},
			expected: 99,
		},
		{
			name:     "Missing user_id",
			setup:    func(c *gin.Context) {},
			expected: 0,
		},
		{
			name: "Invalid type user_id",
			setup: func(c *gin.Context) {
				c.Set(ContextUserIDKey, "not-an-int")
			},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			tt.setup(c)

			got := GetUserID(c)
			if got != tt.expected {
				t.Errorf("GetUserID() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestGetRoleID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name     string
		setup    func(c *gin.Context)
		expected int
	}{
		{
			name: "Integer role_id",
			setup: func(c *gin.Context) {
				c.Set(ContextRoleIDKey, 1)
			},
			expected: 1,
		},
		{
			name: "Float64 role_id",
			setup: func(c *gin.Context) {
				c.Set(ContextRoleIDKey, float64(2))
			},
			expected: 2,
		},
		{
			name:     "Missing role_id",
			setup:    func(c *gin.Context) {},
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			tt.setup(c)

			got := GetRoleID(c)
			if got != tt.expected {
				t.Errorf("GetRoleID() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestGetUsername(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set(ContextUsernameKey, "superadmin")

	if got := GetUsername(c); got != "superadmin" {
		t.Errorf("GetUsername() = %v, want 'superadmin'", got)
	}

	cEmpty, _ := gin.CreateTestContext(httptest.NewRecorder())
	if got := GetUsername(cEmpty); got != "" {
		t.Errorf("GetUsername() on empty = %v, want ''", got)
	}
}

func TestAuthMiddleware_TokenAndClaimValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	origSecret := config.AppConfig.JWTSecret
	config.AppConfig.JWTSecret = "unit-test-jwt-secret"
	t.Cleanup(func() { config.AppConfig.JWTSecret = origSecret })

	signToken := func(claims jwt.MapClaims, secret string) string {
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		s, err := tok.SignedString([]byte(secret))
		if err != nil {
			t.Fatalf("failed to sign test token: %v", err)
		}
		return s
	}

	r := gin.New()
	r.Use(AuthMiddleware())
	r.GET("/me", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id":  GetUserID(c),
			"role_id":  GetRoleID(c),
			"username": GetUsername(c),
		})
	})

	t.Run("rejects request without token", func(t *testing.T) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/me", nil))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("rejects token with invalid signature", func(t *testing.T) {
		badTok := signToken(jwt.MapClaims{"user_id": 10, "role_id": 2}, "wrong-secret")
		req := httptest.NewRequest(http.MethodGet, "/me", nil)
		req.Header.Set("Authorization", "Bearer "+badTok)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", w.Code)
		}
	})

	t.Run("rejects valid token when user_id claim is missing or zero", func(t *testing.T) {
		zeroTok := signToken(jwt.MapClaims{"user_id": 0, "role_id": 2, "exp": time.Now().Add(time.Hour).Unix()}, config.AppConfig.JWTSecret)
		req := httptest.NewRequest(http.MethodGet, "/me", nil)
		req.Header.Set("Authorization", "Bearer "+zeroTok)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for user_id=0, got %d", w.Code)
		}
	})

	t.Run("accepts valid Bearer token and populates context claims", func(t *testing.T) {
		validTok := signToken(jwt.MapClaims{
			"user_id":  42,
			"role_id":  3,
			"username": "warehouse_lead",
			"locale":   "en-US",
			"exp":      time.Now().Add(time.Hour).Unix(),
		}, config.AppConfig.JWTSecret)

		req := httptest.NewRequest(http.MethodGet, "/me", nil)
		req.Header.Set("Authorization", "Bearer "+validTok)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	})
}
