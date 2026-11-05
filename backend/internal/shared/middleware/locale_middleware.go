package middleware

import (
	"context"
	"strings"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/gin-gonic/gin"
)

const (
	// LocaleContextKey is the context key used for standard context.Context propagation.
	LocaleContextKey = i18n.LocaleContextKey

	// GinLocaleKey is the resolved locale key stored in gin.Context.
	GinLocaleKey = i18n.GinLocaleKey

	// GinJWTLocaleKey stores the raw locale claim extracted from JWT by AuthMiddleware.
	GinJWTLocaleKey = i18n.GinJWTLocaleKey

	// DefaultLocale is the system-wide fallback locale.
	DefaultLocale = i18n.DefaultLocale
)

// SupportedLocales defines the initial list of valid system locales (kept for backwards compatibility).
var SupportedLocales = map[string]bool{
	"id-ID": true,
	"en-US": true,
}

// LocaleContextMiddleware detects and attaches the user's preferred locale to context.
// Priority hierarchy:
// 1. Header 'X-User-Locale' (sent by Axios for instant UI changes)
// 2. JWT claims or session context ('jwt_locale')
// 3. Header 'Accept-Language' (for guest or unauthenticated requests)
// 4. Default system fallback ('id-ID')
func LocaleContextMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ApplyResolvedLocale(c)
		c.Next()
	}
}

// ApplyResolvedLocale evaluates the locale priority hierarchy and synchronizes both gin.Context and http.Request.Context.
func ApplyResolvedLocale(c *gin.Context) string {
	locale := resolveLocale(c)
	c.Set(GinLocaleKey, locale)
	ctx := context.WithValue(c.Request.Context(), LocaleContextKey, locale)
	c.Request = c.Request.WithContext(ctx)
	return locale
}

// GetLocale extracts the current locale from gin.Context.
func GetLocale(c *gin.Context) string {
	if val, exists := c.Get(GinLocaleKey); exists {
		if s, ok := val.(string); ok && s != "" {
			return s
		}
	}
	return DefaultLocale
}

// GetLocaleFromContext extracts the current locale from standard context.Context.
func GetLocaleFromContext(ctx context.Context) string {
	return i18n.GetLocaleFromContext(ctx)
}

func resolveLocale(c *gin.Context) string {
	// Priority 1: X-User-Locale Header
	if custom := strings.TrimSpace(c.GetHeader("X-User-Locale")); custom != "" {
		if isValidLocale(custom) {
			return normalizeLocale(custom)
		}
	}

	// Priority 2: Gin context / JWT Claims (if authenticated)
	if jwtLocale, exists := c.Get(GinJWTLocaleKey); exists {
		if s, ok := jwtLocale.(string); ok && s != "" && isValidLocale(s) {
			return normalizeLocale(s)
		}
	}
	if tokenLocale, exists := c.Get(GinLocaleKey); exists {
		if s, ok := tokenLocale.(string); ok && s != "" && isValidLocale(s) {
			return normalizeLocale(s)
		}
	}

	// Priority 3: Accept-Language Header (Guest requests)
	if acceptLang := strings.TrimSpace(c.GetHeader("Accept-Language")); acceptLang != "" {
		parsed := parseAcceptLanguage(acceptLang)
		if parsed != "" && isValidLocale(parsed) {
			return normalizeLocale(parsed)
		}
	}

	// Priority 4: Default Fallback
	return DefaultLocale
}

func isValidLocale(loc string) bool {
	return i18n.IsValidLocale(loc)
}

func normalizeLocale(loc string) string {
	return i18n.NormalizeLocale(loc)
}

func parseAcceptLanguage(header string) string {
	// e.g. "en-US,en;q=0.9,id;q=0.8"
	parts := strings.Split(header, ",")
	for _, part := range parts {
		sub := strings.Split(strings.TrimSpace(part), ";")
		lang := strings.TrimSpace(sub[0])
		if lang != "" {
			return normalizeLocale(lang)
		}
	}
	return ""
}

