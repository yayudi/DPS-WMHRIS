package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Gin context key constants for authenticated user data.
const (
	ContextUserIDKey   = utils.ContextUserIDKey
	ContextUsernameKey = "username"
	ContextRoleIDKey   = "role_id"
)

// GetUserID extracts the authenticated user ID from gin.Context.
func GetUserID(c *gin.Context) int {
	val, exists := c.Get(ContextUserIDKey)
	if !exists {
		return 0
	}
	switch v := val.(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

// GetRoleID extracts the authenticated role ID from gin.Context.
func GetRoleID(c *gin.Context) int {
	val, exists := c.Get(ContextRoleIDKey)
	if !exists {
		return 0
	}
	switch v := val.(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

// GetUsername extracts the authenticated username from gin.Context.
func GetUsername(c *gin.Context) string {
	val, exists := c.Get(ContextUsernameKey)
	if !exists {
		return ""
	}
	if s, ok := val.(string); ok {
		return s
	}
	return ""
}

// AuthMiddleware validates the caller's JWT from the Authorization Bearer header or token cookie,
// populates user identity claims into gin.Context, and rejects unauthenticated requests with 401.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenString string

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		} else {
			cookieToken, err := c.Cookie("token")
			if err == nil && cookieToken != "" {
				tokenString = strings.TrimSpace(cookieToken)
			}
		}

		if tokenString == "" {
			log.Printf("[AUTH] Missing or invalid token header/cookie")
			utils.LocalizedError(c, http.StatusUnauthorized, "errors.unauthorized", nil, "UNAUTHORIZED")
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(config.AppConfig.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			log.Printf("[AUTH] Token validation failed: %v", err)
			utils.LocalizedError(c, http.StatusUnauthorized, "errors.unauthorized", nil, "UNAUTHORIZED")
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			log.Printf("[AUTH] Failed to parse JWT claims")
			utils.LocalizedError(c, http.StatusUnauthorized, "errors.unauthorized", nil, "UNAUTHORIZED")
			c.Abort()
			return
		}

		var userID int
		if v, ok := claims["user_id"].(float64); ok {
			userID = int(v)
		} else if v, ok := claims["user_id"].(int); ok {
			userID = v
		}
		if userID <= 0 {
			log.Printf("[AUTH] Rejecting token with invalid or missing user_id claim")
			utils.LocalizedError(c, http.StatusUnauthorized, "errors.unauthorized", nil, "UNAUTHORIZED")
			c.Abort()
			return
		}

		var roleID int
		if v, ok := claims["role_id"].(float64); ok {
			roleID = int(v)
		} else if v, ok := claims["role_id"].(int); ok {
			roleID = v
		}

		c.Set(ContextUserIDKey, userID)
		if username, ok := claims["username"].(string); ok {
			c.Set(ContextUsernameKey, username)
		}
		c.Set(ContextRoleIDKey, roleID)
		if loc, ok := claims["locale"].(string); ok && loc != "" {
			c.Set(GinJWTLocaleKey, loc)
			ApplyResolvedLocale(c)
		}

		c.Next()
	}
}
