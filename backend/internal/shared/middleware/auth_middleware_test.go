package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
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
