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
	"time"

	iam_http "github.com/dps-wmhris/backend/internal/modules/iam/adapter/inbound/http"
	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

type mockUserUseCase struct {
	loginFunc             func(ctx context.Context, req iam_dto.LoginRequest) (*iam_dto.LoginResponse, error)
	getProfileFunc        func(ctx context.Context, userID int) (*iam_dto.UserProfile, error)
	updateProfileFunc     func(ctx context.Context, userID int, req iam_dto.UpdateProfileRequest, ip, ua string) (*iam_dto.UserProfile, error)
	getMyLocationsFunc    func(ctx context.Context, userID int) ([]iam_dto.UserLocationResponse, error)
	getPreferencesFunc    func(ctx context.Context, userID int) (*iam_dto.UserPreferenceDTO, error)
	updatePreferencesFunc func(ctx context.Context, userID int, req iam_dto.UpdatePreferenceRequest) (*iam_dto.UserPreferenceDTO, error)
}

func (m *mockUserUseCase) Login(ctx context.Context, req iam_dto.LoginRequest) (*iam_dto.LoginResponse, error) {
	if m.loginFunc != nil {
		return m.loginFunc(ctx, req)
	}
	return nil, nil
}

func (m *mockUserUseCase) GetProfile(ctx context.Context, userID int) (*iam_dto.UserProfile, error) {
	if m.getProfileFunc != nil {
		return m.getProfileFunc(ctx, userID)
	}
	return nil, nil
}

func (m *mockUserUseCase) UpdateProfile(ctx context.Context, userID int, req iam_dto.UpdateProfileRequest, ip, ua string) (*iam_dto.UserProfile, error) {
	if m.updateProfileFunc != nil {
		return m.updateProfileFunc(ctx, userID, req, ip, ua)
	}
	return nil, nil
}

func (m *mockUserUseCase) GetMyLocations(ctx context.Context, userID int) ([]iam_dto.UserLocationResponse, error) {
	if m.getMyLocationsFunc != nil {
		return m.getMyLocationsFunc(ctx, userID)
	}
	return nil, nil
}

func (m *mockUserUseCase) GetPreferences(ctx context.Context, userID int) (*iam_dto.UserPreferenceDTO, error) {
	if m.getPreferencesFunc != nil {
		return m.getPreferencesFunc(ctx, userID)
	}
	return nil, nil
}

func (m *mockUserUseCase) UpdatePreferences(ctx context.Context, userID int, req iam_dto.UpdatePreferenceRequest) (*iam_dto.UserPreferenceDTO, error) {
	if m.updatePreferencesFunc != nil {
		return m.updatePreferencesFunc(ctx, userID, req)
	}
	return nil, nil
}

func setupUserRouter(handler *iam_http.UserHandler, authUserID int) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if authUserID > 0 {
			c.Set(middleware.ContextUserIDKey, authUserID)
		}
		c.Next()
	})
	r.GET("/user/preferences", handler.GetPreferences)
	r.PUT("/user/preferences", handler.UpdatePreferences)
	return r
}

func TestUserHandler_Preferences_UnauthorizedWhenNoUserID(t *testing.T) {
	handler := iam_http.NewUserHandler(&mockUserUseCase{})
	router := setupUserRouter(handler, 0) // Unauthenticated (userID = 0)

	// 1. GET /user/preferences without auth
	reqGet, _ := http.NewRequest(http.MethodGet, "/user/preferences", nil)
	wGet := httptest.NewRecorder()
	router.ServeHTTP(wGet, reqGet)

	if wGet.Code != http.StatusUnauthorized {
		t.Errorf("expected GET status 401, got %d", wGet.Code)
	}

	// 2. PUT /user/preferences without auth
	reqPut, _ := http.NewRequest(http.MethodPut, "/user/preferences", bytes.NewReader([]byte("{}")))
	reqPut.Header.Set("Content-Type", "application/json")
	wPut := httptest.NewRecorder()
	router.ServeHTTP(wPut, reqPut)

	if wPut.Code != http.StatusUnauthorized {
		t.Errorf("expected PUT status 401, got %d", wPut.Code)
	}
}

func TestUserHandler_UpdatePreferences_ValidationAndErrorMasking(t *testing.T) {
	mockUC := &mockUserUseCase{}
	handler := iam_http.NewUserHandler(mockUC)
	router := setupUserRouter(handler, 42) // Authenticated (userID = 42)

	// 1. Domain Validation Error -> Returns 400 Bad Request
	mockUC.updatePreferencesFunc = func(ctx context.Context, userID int, req iam_dto.UpdatePreferenceRequest) (*iam_dto.UserPreferenceDTO, error) {
		return nil, domain.ErrInvalidPreferenceTimezone
	}

	payload := iam_dto.UpdatePreferenceRequest{
		Timezone: strPtr("Invalid/Zone"),
	}
	body, _ := json.Marshal(payload)
	reqBad, _ := http.NewRequest(http.MethodPut, "/user/preferences", bytes.NewReader(body))
	reqBad.Header.Set("Content-Type", "application/json")
	wBad := httptest.NewRecorder()

	router.ServeHTTP(wBad, reqBad)

	if wBad.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for domain error, got %d", wBad.Code)
	}
	if !strings.Contains(wBad.Body.String(), "VALIDATION_ERROR") {
		t.Errorf("expected VALIDATION_ERROR code, got %s", wBad.Body.String())
	}
	if !strings.Contains(wBad.Body.String(), domain.ErrInvalidPreferenceTimezone.Error()) {
		t.Errorf("expected domain error message in response, got %s", wBad.Body.String())
	}

	// 2. Internal Database Error -> Returns 500 without leaking raw SQL details (CWE-209)
	mockUC.updatePreferencesFunc = func(ctx context.Context, userID int, req iam_dto.UpdatePreferenceRequest) (*iam_dto.UserPreferenceDTO, error) {
		return nil, errors.New("Error 1452: Cannot add or update a child row: a foreign key constraint fails (`db_wms_dev`.`user_preferences`, CONSTRAINT `fk_user_preferences_locale`)")
	}

	reqErr, _ := http.NewRequest(http.MethodPut, "/user/preferences", bytes.NewReader(body))
	reqErr.Header.Set("Content-Type", "application/json")
	wErr := httptest.NewRecorder()

	router.ServeHTTP(wErr, reqErr)

	if wErr.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500 for internal error, got %d", wErr.Code)
	}
	respStr := wErr.Body.String()
	if strings.Contains(respStr, "1452") || strings.Contains(respStr, "fk_user_preferences_locale") {
		t.Errorf("security violation: raw DB constraint details leaked to client: %s", respStr)
	}
	if !strings.Contains(respStr, "INTERNAL_SERVER_ERROR") {
		t.Errorf("expected INTERNAL_SERVER_ERROR code, got %s", respStr)
	}
}

func TestUserHandler_GetPreferences_Success(t *testing.T) {
	mockUC := &mockUserUseCase{
		getPreferencesFunc: func(ctx context.Context, userID int) (*iam_dto.UserPreferenceDTO, error) {
			return &iam_dto.UserPreferenceDTO{
				UserID:     userID,
				Locale:     "id-ID",
				Theme:      "light",
				Timezone:   "Asia/Jakarta",
				DateFormat: "YYYY-MM-DD",
				UpdatedAt:  time.Now(),
			}, nil
		},
	}
	handler := iam_http.NewUserHandler(mockUC)
	router := setupUserRouter(handler, 10)

	req, _ := http.NewRequest(http.MethodGet, "/user/preferences", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "Asia/Jakarta") {
		t.Errorf("expected timezone Asia/Jakarta in response, got %s", w.Body.String())
	}
}

func strPtr(s string) *string {
	return &s
}
