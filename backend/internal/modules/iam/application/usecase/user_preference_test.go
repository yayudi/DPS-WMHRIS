package usecase_test

import (
	"context"
	"testing"
	"time"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
)

type mockUserPrefRepo struct {
	prefs map[int]*domain.UserPreference
}

func (m *mockUserPrefRepo) GetByUserID(ctx context.Context, userID int) (*domain.UserPreference, error) {
	return m.prefs[userID], nil
}

func (m *mockUserPrefRepo) Upsert(ctx context.Context, pref *domain.UserPreference) error {
	m.prefs[pref.UserID] = pref
	return nil
}

func TestUserPreference_GetAndUpdate(t *testing.T) {
	prefRepo := &mockUserPrefRepo{
		prefs: make(map[int]*domain.UserPreference),
	}

	// Mock minimal dependencies
	service := usecase.NewUserUseCase(nil, nil, prefRepo, nil)
	ctx := context.Background()

	// 1. GetPreferences for user with no record -> should return defaults
	defaultPref, err := service.GetPreferences(ctx, 99)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if defaultPref.Locale != "id-ID" || defaultPref.Theme != "light" {
		t.Errorf("expected default id-ID and light, got %s, %s", defaultPref.Locale, defaultPref.Theme)
	}

	// 2. Update preference: switch to en-US and dark
	newLocale := "en-US"
	newTheme := "dark"
	updated, err := service.UpdatePreferences(ctx, 99, iam_dto.UpdatePreferenceRequest{
		Locale: &newLocale,
		Theme:  &newTheme,
	})
	if err != nil {
		t.Fatalf("unexpected error updating preferences: %v", err)
	}
	if updated.Locale != "en-US" || updated.Theme != "dark" {
		t.Errorf("expected en-US and dark, got %s, %s", updated.Locale, updated.Theme)
	}

	// 3. GetPreferences again -> should return newly updated preference
	pref, err := service.GetPreferences(ctx, 99)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pref.Locale != "en-US" || pref.Theme != "dark" {
		t.Errorf("expected persisted en-US and dark, got %s, %s", pref.Locale, pref.Theme)
	}

	// Timezone and date_format should preserve defaults
	if pref.Timezone != "Asia/Jakarta" || pref.DateFormat != "YYYY-MM-DD" {
		t.Errorf("expected default timezone/date_format preserved, got %s, %s", pref.Timezone, pref.DateFormat)
	}
	_ = time.Now()
}

func TestUserPreference_ValidationErrors(t *testing.T) {
	prefRepo := &mockUserPrefRepo{
		prefs: make(map[int]*domain.UserPreference),
	}
	service := usecase.NewUserUseCase(nil, nil, prefRepo, nil)
	ctx := context.Background()

	// 1. Invalid locale
	badLocale := "xx-FAKE"
	_, err := service.UpdatePreferences(ctx, 10, iam_dto.UpdatePreferenceRequest{
		Locale: &badLocale,
	})
	if err != domain.ErrInvalidPreferenceLocale {
		t.Errorf("expected ErrInvalidPreferenceLocale, got %v", err)
	}

	// 2. Invalid timezone
	badTz := "Atlantis/Lost_City"
	_, err = service.UpdatePreferences(ctx, 10, iam_dto.UpdatePreferenceRequest{
		Timezone: &badTz,
	})
	if err != domain.ErrInvalidPreferenceTimezone {
		t.Errorf("expected ErrInvalidPreferenceTimezone, got %v", err)
	}

	// 3. Invalid date format
	badDf := "YYYY/DD/MM/HACK"
	_, err = service.UpdatePreferences(ctx, 10, iam_dto.UpdatePreferenceRequest{
		DateFormat: &badDf,
	})
	if err != domain.ErrInvalidPreferenceDateFormat {
		t.Errorf("expected ErrInvalidPreferenceDateFormat, got %v", err)
	}

	// 4. Valid timezone and date format
	validTz := "America/New_York"
	validDf := "DD MMM YYYY"
	updated, err := service.UpdatePreferences(ctx, 10, iam_dto.UpdatePreferenceRequest{
		Timezone:   &validTz,
		DateFormat: &validDf,
	})
	if err != nil {
		t.Fatalf("unexpected error with valid timezone/date_format: %v", err)
	}
	if updated.Timezone != "America/New_York" || updated.DateFormat != "DD MMM YYYY" {
		t.Errorf("expected updated timezone & date format, got %s, %s", updated.Timezone, updated.DateFormat)
	}
}

type mockUserRepo struct {
	port.UserRepository
	user *domain.User
}

func (m *mockUserRepo) FindByID(ctx context.Context, id int) (*domain.User, error) {
	if m.user != nil {
		return m.user, nil
	}
	u := &domain.User{
		Username:     "testuser",
		Nickname:     "Test User",
		RoleID:       1,
		PasswordHash: "mockhash",
	}
	u.ID = id
	return u, nil
}

func (m *mockUserRepo) GetRoleAndPermissions(ctx context.Context, roleID int) (string, []string, error) {
	return "Admin", []string{"system.localization.manage"}, nil
}

func TestUserPreference_ProfileAlwaysIncludesDefaultPreferences(t *testing.T) {
	prefRepo := &mockUserPrefRepo{
		prefs: make(map[int]*domain.UserPreference),
	}
	userRepo := &mockUserRepo{}
	service := usecase.NewUserUseCase(nil, userRepo, prefRepo, nil)
	ctx := context.Background()

	// GetProfile for a user with NO existing record in user_preferences table
	profile, err := service.GetProfile(ctx, 77)
	if err != nil {
		t.Fatalf("unexpected error fetching profile: %v", err)
	}

	// SSoT Verification: Preferences MUST NOT be nil and MUST contain domain defaults
	if profile.Preferences == nil {
		t.Fatalf("expected non-nil Preferences in UserProfile")
	}
	if profile.Preferences.Locale != domain.DefaultPreferenceLocale {
		t.Errorf("expected default locale %s, got %s", domain.DefaultPreferenceLocale, profile.Preferences.Locale)
	}
	if profile.Preferences.Theme != domain.DefaultPreferenceTheme {
		t.Errorf("expected default theme %s, got %s", domain.DefaultPreferenceTheme, profile.Preferences.Theme)
	}
	if profile.Preferences.Timezone != domain.DefaultPreferenceTimezone {
		t.Errorf("expected default timezone %s, got %s", domain.DefaultPreferenceTimezone, profile.Preferences.Timezone)
	}
	if profile.Preferences.DateFormat != domain.DefaultPreferenceDateFormat {
		t.Errorf("expected default date format %s, got %s", domain.DefaultPreferenceDateFormat, profile.Preferences.DateFormat)
	}
}

