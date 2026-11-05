package i18n_test

import (
	"context"
	"testing"

	"github.com/dps-wmhris/backend/internal/shared/i18n"
)

func TestI18n_NormalizeAndValidation(t *testing.T) {
	if i18n.NormalizeLocale("EN") != "en-US" {
		t.Errorf("expected en-US, got %s", i18n.NormalizeLocale("EN"))
	}
	if i18n.NormalizeLocale("id-id") != "id-ID" {
		t.Errorf("expected id-ID, got %s", i18n.NormalizeLocale("id-id"))
	}
	if i18n.NormalizeLocale("ja-JP") != "ja-JP" {
		t.Errorf("expected ja-JP, got %s", i18n.NormalizeLocale("ja-JP"))
	}

	if !i18n.IsValidLocale("id-ID") || !i18n.IsValidLocale("en-US") {
		t.Errorf("expected initial default locales to be valid")
	}
	if i18n.IsValidLocale("ja-JP") {
		t.Errorf("expected ja-JP to be invalid before registration")
	}

	// Test dynamic registration
	i18n.RegisterSupportedLocales([]string{"id-ID", "en-US", "ja-JP"})
	if !i18n.IsValidLocale("ja-JP") {
		t.Errorf("expected ja-JP to be valid after dynamic registration")
	}
}

func TestI18n_ContextAndTranslation(t *testing.T) {
	mockDict := map[string]map[string]string{
		"id-ID": {
			"common.hello":       "Halo {name}, stok: {qty}",
			"errors.unauthorized": "Sesi telah berakhir atau tidak memiliki izin",
			"errors.forbidden":    "Anda tidak memiliki akses ke fitur ini",
		},
		"en-US": {
			"common.hello":       "Hello {name}, stock: {qty}",
			"errors.unauthorized": "Session expired or unauthorized",
			"errors.forbidden":    "You do not have access to this feature",
		},
	}

	i18n.RegisterLookupHook(func(ctx context.Context, locale, fullKey string) (string, bool) {
		if sub, ok := mockDict[locale]; ok {
			val, found := sub[fullKey]
			return val, found
		}
		return "", false
	})

	ctxID := context.WithValue(context.Background(), i18n.LocaleContextKey, "id-ID")
	ctxEN := context.WithValue(context.Background(), i18n.LocaleContextKey, "en-US")

	// Test parameter interpolation
	msgID := i18n.T(ctxID, "common.hello", map[string]any{"name": "Budi", "qty": 10})
	if msgID != "Halo Budi, stok: 10" {
		t.Errorf("unexpected ID translation: %s", msgID)
	}

	msgEN := i18n.T(ctxEN, "common.hello", map[string]any{"name": "John", "qty": 25})
	if msgEN != "Hello John, stock: 25" {
		t.Errorf("unexpected EN translation: %s", msgEN)
	}

	// Test TranslateErrorCode: id-ID preserves custom domain message
	errID := i18n.TranslateErrorCode(ctxID, "id-ID", "FORBIDDEN", "Tidak boleh masuk gudang A")
	if errID != "Tidak boleh masuk gudang A" {
		t.Errorf("expected custom domain error preserved for id-ID, got: %s", errID)
	}

	// Test TranslateErrorCode: en-US resolves from dictionary
	errEN := i18n.TranslateErrorCode(ctxEN, "en-US", "FORBIDDEN", "Tidak boleh masuk gudang A")
	if errEN != "You do not have access to this feature" {
		t.Errorf("expected translated error for en-US, got: %s", errEN)
	}

	// Test TranslateErrorCode: missing key falls back to message
	unknownErr := i18n.TranslateErrorCode(ctxEN, "en-US", "UNKNOWN_CODE", "Pesan default")
	if unknownErr != "Pesan default" {
		t.Errorf("expected fallback message, got: %s", unknownErr)
	}
}

