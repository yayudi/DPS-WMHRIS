package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/dps-wmhris/backend/internal/utils"

	"github.com/dps-wmhris/backend/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

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

			c.Set("user_id", userID)
			c.Set("username", claims["username"])
			c.Set("role_id", roleID)
		} else {
			log.Printf("[AUTH] Failed to parse claims")
		}

		c.Next()
	}
}

