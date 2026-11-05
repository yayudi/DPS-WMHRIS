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
	ContextUserIDKey   = "user_id"
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

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		var tokenString string

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			cookieToken, err := c.Cookie("token")
			if err == nil && cookieToken != "" {
				tokenString = cookieToken
			}
		}

		if tokenString == "" {
			log.Printf("[AUTH] Missing or invalid token header/cookie")
			utils.ErrorResponse(c, http.StatusUnauthorized, "unauthorized: missing or invalid token", "UNAUTHORIZED")
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(config.AppConfig.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			log.Printf("[AUTH] Token validation failed: %v", err)
			utils.ErrorResponse(c, http.StatusUnauthorized, "unauthorized: token expired or invalid", "UNAUTHORIZED")
			c.Abort()
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			var userID int
			if v, ok := claims["user_id"].(float64); ok {
				userID = int(v)
			} else if v, ok := claims["user_id"].(int); ok {
				userID = v
			} else {
				// Fallback
				userID = 0
			}

			var roleID int
			if v, ok := claims["role_id"].(float64); ok {
				roleID = int(v)
			} else if v, ok := claims["role_id"].(int); ok {
				roleID = v
			} else {
				roleID = 0
			}

			c.Set(ContextUserIDKey, userID)
			c.Set(ContextUsernameKey, claims["username"])
			c.Set(ContextRoleIDKey, roleID)
			if loc, ok := claims["locale"].(string); ok && loc != "" {
				c.Set(GinJWTLocaleKey, loc)
				ApplyResolvedLocale(c)
			}
		} else {
			log.Printf("[AUTH] Failed to parse claims")
		}

		c.Next()
	}
}
