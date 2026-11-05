package i18n

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

type contextKey string

const (
	// LocaleContextKey is used for standard context.Context propagation.
	LocaleContextKey contextKey = "app_locale"

	// GinLocaleKey stores the active locale in gin.Context.
	GinLocaleKey = "locale"

	// GinJWTLocaleKey stores the raw locale claim from JWT in gin.Context.
	GinJWTLocaleKey = "jwt_locale"

	// DefaultLocale is the system-wide baseline locale.
	DefaultLocale = "id-ID"
)

// LookupFunc defines the signature for querying a translation entry from cache or storage.
type LookupFunc func(ctx context.Context, locale, fullKey string) (string, bool)

var (
	mu               sync.RWMutex
	supportedLocales = map[string]bool{
		"id-ID": true,
		"en-US": true,
	}
	lookupHook LookupFunc
)

// RegisterSupportedLocales dynamically updates the active locale whitelist from the database.
func RegisterSupportedLocales(codes []string) {
	if len(codes) == 0 {
		return
	}
	mu.Lock()
	defer mu.Unlock()
	next := make(map[string]bool, len(codes)+1)
	next[DefaultLocale] = true
	for _, c := range codes {
		if trimmed := strings.TrimSpace(c); trimmed != "" {
			next[trimmed] = true
		}
	}
	supportedLocales = next
}

// RegisterLookupHook binds the dictionary lookup provider (typically provided by LocalizationService).
func RegisterLookupHook(fn LookupFunc) {
	mu.Lock()
	defer mu.Unlock()
	lookupHook = fn
}

// IsValidLocale checks if a locale string matches any registered supported locale.
func IsValidLocale(loc string) bool {
	normalized := NormalizeLocale(loc)
	mu.RLock()
	defer mu.RUnlock()
	return supportedLocales[normalized]
}

// NormalizeLocale standardizes common locale aliases and prefixes to canonical codes.
func NormalizeLocale(loc string) string {
	clean := strings.TrimSpace(loc)
	if clean == "" {
		return DefaultLocale
	}
	lower := strings.ToLower(clean)
	if strings.HasPrefix(lower, "en") {
		return "en-US"
	}
	if strings.HasPrefix(lower, "id") || strings.HasPrefix(lower, "in") {
		return "id-ID"
	}
	return clean
}

// GetLocaleFromContext extracts the active locale from standard context.Context.
func GetLocaleFromContext(ctx context.Context) string {
	if ctx == nil {
		return DefaultLocale
	}
	if val := ctx.Value(LocaleContextKey); val != nil {
		if s, ok := val.(string); ok && s != "" {
			return s
		}
	}
	return DefaultLocale
}

// T translates a key using the locale resolved from context.Context, with optional dynamic parameter interpolation.
func T(ctx context.Context, key string, params ...map[string]any) string {
	locale := GetLocaleFromContext(ctx)
	return TranslateByLocale(ctx, locale, key, params...)
}

// TranslateByLocale looks up a translation key for a specific locale and interpolates parameters.
func TranslateByLocale(ctx context.Context, locale, fullKey string, params ...map[string]any) string {
	if locale == "" {
		locale = DefaultLocale
	}
	fullKey = strings.TrimSpace(fullKey)
	if fullKey == "" {
		return ""
	}

	mu.RLock()
	hook := lookupHook
	mu.RUnlock()

	translated := fullKey
	if hook != nil {
		if val, found := hook(ctx, locale, fullKey); found && val != "" {
			translated = val
		}
	}

	if len(params) > 0 && params[0] != nil {
		for k, v := range params[0] {
			placeholder := fmt.Sprintf("{%s}", k)
			translated = strings.ReplaceAll(translated, placeholder, fmt.Sprint(v))
		}
	}

	return translated
}

// TranslateErrorCode resolves standardized error codes to localized error messages.
// If locale is DefaultLocale and fallbackMsg is non-empty, fallbackMsg is preserved.
// If locale is not DefaultLocale, it looks up "errors.<error_code_lowercase>". If found, it returns the translation.
func TranslateErrorCode(ctx context.Context, locale, errorCode, fallbackMsg string) string {
	if locale == "" {
		locale = DefaultLocale
	}
	codeKey := strings.ToLower(strings.TrimSpace(errorCode))
	if codeKey == "" {
		return fallbackMsg
	}

	fullKey := fmt.Sprintf("errors.%s", codeKey)

	// When user is on default locale (id-ID) and a custom domain message is provided, prioritize it.
	if locale == DefaultLocale && strings.TrimSpace(fallbackMsg) != "" {
		return fallbackMsg
	}

	mu.RLock()
	hook := lookupHook
	mu.RUnlock()

	if hook != nil {
		if val, found := hook(ctx, locale, fullKey); found && strings.TrimSpace(val) != "" {
			if parts := strings.SplitN(fallbackMsg, ": ", 2); len(parts) == 2 && strings.TrimSpace(parts[1]) != "" {
				return fmt.Sprintf("%s: %s", val, parts[1])
			}
			return val
		}
	}

	if strings.TrimSpace(fallbackMsg) != "" {
		return fallbackMsg
	}
	return errorCode
}
