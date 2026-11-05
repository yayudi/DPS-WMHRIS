package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	system_http "github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/http"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/gin-gonic/gin"
)

type mockLocalizationUseCase struct {
	getLocalesFunc       func(ctx context.Context) ([]system_dto.LocaleDTO, error)
	getMergedDictFunc    func(ctx context.Context, locale string) (*domain.LocalizationDictionary, error)
	getMatrixFunc        func(ctx context.Context, filter system_dto.TranslationMatrixFilter) (*system_dto.TranslationMatrixResponse, error)
	saveTranslationsFunc func(ctx context.Context, req system_dto.SaveTranslationsRequest, audit ...system_dto.AuditMetadata) (uint, error)
}

func (m *mockLocalizationUseCase) GetAvailableLocales(ctx context.Context) ([]system_dto.LocaleDTO, error) {
	if m.getLocalesFunc != nil {
		return m.getLocalesFunc(ctx)
	}
	return nil, nil
}

func (m *mockLocalizationUseCase) GetMergedDictionary(ctx context.Context, localeCode string) (*domain.LocalizationDictionary, error) {
	if m.getMergedDictFunc != nil {
		return m.getMergedDictFunc(ctx, localeCode)
	}
	return nil, nil
}

func (m *mockLocalizationUseCase) GetTranslationMatrix(ctx context.Context, filter system_dto.TranslationMatrixFilter) (*system_dto.TranslationMatrixResponse, error) {
	if m.getMatrixFunc != nil {
		return m.getMatrixFunc(ctx, filter)
	}
	return nil, nil
}

func (m *mockLocalizationUseCase) SaveTranslations(ctx context.Context, req system_dto.SaveTranslationsRequest, audit ...system_dto.AuditMetadata) (uint, error) {
	if m.saveTranslationsFunc != nil {
		return m.saveTranslationsFunc(ctx, req, audit...)
	}
	return 0, nil
}

func setupTestRouter(handler *system_http.LocalizationHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/system/localization/locales", handler.GetLocales)
	r.GET("/system/localization/dictionaries/:locale", handler.GetDictionary)
	r.GET("/system/localization/matrix", handler.GetTranslationMatrix)
	r.POST("/system/localization/translations", handler.SaveTranslations)
	return r
}

func TestLocalizationHandler_SaveTranslations_MasksInternalDBError(t *testing.T) {
	mockUC := &mockLocalizationUseCase{
		saveTranslationsFunc: func(ctx context.Context, req system_dto.SaveTranslationsRequest, audit ...system_dto.AuditMetadata) (uint, error) {
			// Simulate raw database error containing sensitive schema and internal deadlock details
			return 0, errors.New("Error 1213: Deadlock found when trying to get lock; table localization_translations")
		},
	}
	handler := system_http.NewLocalizationHandler(mockUC)
	router := setupTestRouter(handler)

	payload := system_dto.SaveTranslationsRequest{
		LocaleCode: "en-US",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common", Key: "btn.save", Value: "Save"},
		},
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "/system/localization/translations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Status code MUST be 500 Internal Server Error (not 400 Bad Request)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status %d, got %d", http.StatusInternalServerError, w.Code)
	}

	respBody := w.Body.String()
	// CWE-209 Verification: Ensure raw DB error details are masked from client
	if strings.Contains(respBody, "Deadlock") {
		t.Errorf("security violation: raw DB deadlock leaked to client: %s", respBody)
	}
	if strings.Contains(respBody, "localization_translations") {
		t.Errorf("security violation: database table name leaked to client: %s", respBody)
	}
	if !strings.Contains(respBody, "INTERNAL_SERVER_ERROR") {
		t.Errorf("expected INTERNAL_SERVER_ERROR error code, got %s", respBody)
	}
}

func TestLocalizationHandler_SaveTranslations_AllowsDomainValidationError(t *testing.T) {
	mockUC := &mockLocalizationUseCase{
		saveTranslationsFunc: func(ctx context.Context, req system_dto.SaveTranslationsRequest, audit ...system_dto.AuditMetadata) (uint, error) {
			return 0, domain.ErrLocaleNotFoundOrInactive
		},
	}
	handler := system_http.NewLocalizationHandler(mockUC)
	router := setupTestRouter(handler)

	payload := system_dto.SaveTranslationsRequest{
		LocaleCode: "xx-YY",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common", Key: "btn.save", Value: "Save"},
		},
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest(http.MethodPost, "/system/localization/translations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Domain validation errors should return 400 Bad Request with VALIDATION_ERROR code
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}

	respBody := w.Body.String()
	if !strings.Contains(respBody, "VALIDATION_ERROR") {
		t.Errorf("expected VALIDATION_ERROR code, got %s", respBody)
	}
	if !strings.Contains(respBody, domain.ErrLocaleNotFoundOrInactive.Error()) {
		t.Errorf("expected domain error message in response, got %s", respBody)
	}
}

func TestLocalizationHandler_GetDictionary_MultiETagAnd304(t *testing.T) {
	mockUC := &mockLocalizationUseCase{
		getMergedDictFunc: func(ctx context.Context, locale string) (*domain.LocalizationDictionary, error) {
			return &domain.LocalizationDictionary{
				Locale:  "en-US",
				Version: 100002,
				Entries: map[string]string{
					"common.btn.save": "Save",
				},
			}, nil
		},
	}
	handler := system_http.NewLocalizationHandler(mockUC)
	router := setupTestRouter(handler)

	// Skenario 1: Multi-ETag in If-None-Match where one matches the current ETag
	req, _ := http.NewRequest(http.MethodGet, "/system/localization/dictionaries/en-US", nil)
	req.Header.Set("If-None-Match", `W/"v1-en-US", W/"v100002-en-US"`)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotModified {
		t.Errorf("expected status 304 Not Modified, got %d", w.Code)
	}
	if w.Header().Get("ETag") != `W/"v100002-en-US"` {
		t.Errorf("expected ETag header W/\"v100002-en-US\", got %s", w.Header().Get("ETag"))
	}
	if !strings.Contains(w.Header().Get("Vary"), "If-None-Match") {
		t.Errorf("expected Vary header to contain If-None-Match, got %s", w.Header().Get("Vary"))
	}

	// Skenario 2: Wildcard '*' in If-None-Match
	reqWildcard, _ := http.NewRequest(http.MethodGet, "/system/localization/dictionaries/en-US", nil)
	reqWildcard.Header.Set("If-None-Match", `*`)
	wWildcard := httptest.NewRecorder()

	router.ServeHTTP(wWildcard, reqWildcard)

	if wWildcard.Code != http.StatusNotModified {
		t.Errorf("expected status 304 for wildcard ETag, got %d", wWildcard.Code)
	}

	// Skenario 3: Mismatched ETag -> Returns 200 OK with full body
	reqMiss, _ := http.NewRequest(http.MethodGet, "/system/localization/dictionaries/en-US", nil)
	reqMiss.Header.Set("If-None-Match", `W/"v99999-en-US"`)
	wMiss := httptest.NewRecorder()

	router.ServeHTTP(wMiss, reqMiss)

	if wMiss.Code != http.StatusOK {
		t.Errorf("expected status 200 OK for mismatched ETag, got %d", wMiss.Code)
	}
	if !strings.Contains(wMiss.Body.String(), "common.btn.save") {
		t.Errorf("expected dictionary entries in body, got %s", wMiss.Body.String())
	}
}

