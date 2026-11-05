package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type userServiceImpl struct {
	txManager    database.TransactionManager
	userRepo     port.UserRepository
	userPrefRepo port.UserPreferenceRepository
	eventBus     eventbus.EventBus
}

func NewUserUseCase(
	txManager database.TransactionManager,
	userRepo port.UserRepository,
	userPrefRepo port.UserPreferenceRepository,
	eventBus eventbus.EventBus,
) port.UserUseCase {
	return &userServiceImpl{
		txManager:    txManager,
		userRepo:     userRepo,
		userPrefRepo: userPrefRepo,
		eventBus:     eventBus,
	}
}

func toPreferenceDTO(pref *domain.UserPreference) *iam_dto.UserPreferenceDTO {
	if pref == nil {
		return nil
	}
	return &iam_dto.UserPreferenceDTO{
		UserID:     pref.UserID,
		Locale:     pref.Locale,
		Theme:      pref.Theme,
		Timezone:   pref.Timezone,
		DateFormat: pref.DateFormat,
		UpdatedAt:  pref.UpdatedAt,
	}
}

func (s *userServiceImpl) resolveUserPreference(ctx context.Context, userID int) (*domain.UserPreference, error) {
	pref, err := s.userPrefRepo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if pref == nil {
		return domain.NewDefaultUserPreference(userID), nil
	}
	return pref, nil
}

func (s *userServiceImpl) Login(ctx context.Context, req iam_dto.LoginRequest) (*iam_dto.LoginResponse, error) {
	user, err := s.userRepo.FindByUsername(ctx, req.Username)
	if err != nil {
		return nil, errors.New("username atau password salah")
	}

	if !user.IsActive {
		return nil, errors.New("akun tidak aktif")
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password))
	if err != nil {
		return nil, errors.New("username atau password salah")
	}

	// Logging login attempt
	role, permissions, _ := s.userRepo.GetRoleAndPermissions(ctx, user.RoleID)
	_ = permissions // we don't use it in token here based on previous code

	// Fetch user preferences
	pref, _ := s.resolveUserPreference(ctx, user.ID)
	prefDTO := toPreferenceDTO(pref)
	locale := pref.Locale

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":       user.ID, // Note: standardizing to 'id' since it might be used by auth middleware
		"user_id":  user.ID,
		"username": user.Username,
		"role_id":  user.RoleID,
		"role":     role,
		"locale":   locale,
		"exp":      time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := token.SignedString([]byte(config.AppConfig.JWTSecret))
	if err != nil {
		return nil, errors.New("gagal memproses autentikasi")
	}

	return &iam_dto.LoginResponse{
		Token: tokenString,
		UserInfo: iam_dto.UserProfile{
			ID:          user.ID,
			Username:    user.Username,
			Nickname:    user.Nickname,
			RoleID:      user.RoleID,
			Permissions: permissions,
			Preferences: prefDTO,
		},
	}, nil
}

func (s *userServiceImpl) GetProfile(ctx context.Context, userID int) (*iam_dto.UserProfile, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, errors.New("user tidak ditemukan")
	}

	_, permissions, _ := s.userRepo.GetRoleAndPermissions(ctx, user.RoleID)

	pref, _ := s.resolveUserPreference(ctx, userID)
	prefDTO := toPreferenceDTO(pref)

	return &iam_dto.UserProfile{
		ID:          user.ID,
		Username:    user.Username,
		Nickname:    user.Nickname,
		RoleID:      user.RoleID,
		Permissions: permissions,
		Preferences: prefDTO,
	}, nil
}

func (s *userServiceImpl) UpdateProfile(ctx context.Context, userID int, req iam_dto.UpdateProfileRequest, ip, userAgent string) (*iam_dto.UserProfile, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, errors.New("user tidak ditemukan")
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword))
	if err != nil {
		return nil, errors.New("password saat ini salah")
	}

	var hashedNewPassword *string
	if req.NewPassword != nil && *req.NewPassword != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return nil, errors.New("gagal memproses password baru")
		}
		hashStr := string(hash)
		hashedNewPassword = &hashStr
	}

	err = s.userRepo.UpdateProfile(ctx, userID, req.Nickname, hashedNewPassword)
	if err != nil {
		return nil, errors.New("gagal memperbarui profil")
	}

	updatedUser, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, errors.New("gagal mengambil data profil terbaru")
	}

	// Logging
	changes := map[string]interface{}{
		"note": "Self Profile Update",
		"updates": map[string]interface{}{
			"nickname":        req.Nickname,
			"passwordChanged": hashedNewPassword != nil,
		},
	}
	changesBytes, _ := json.Marshal(changes)
	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(userID),
		Changes:    changesBytes,
		IP:         ip,
		UserAgent:  userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return &iam_dto.UserProfile{
		ID:       updatedUser.ID,
		Username: updatedUser.Username,
		Nickname: updatedUser.Nickname,
		RoleID:   updatedUser.RoleID,
	}, nil
}

func (s *userServiceImpl) GetMyLocations(ctx context.Context, userID int) ([]iam_dto.UserLocationResponse, error) {
	return s.userRepo.GetUserLocations(ctx, userID)
}

func (s *userServiceImpl) GetPreferences(ctx context.Context, userID int) (*iam_dto.UserPreferenceDTO, error) {
	pref, err := s.resolveUserPreference(ctx, userID)
	if err != nil {
		return nil, err
	}
	return toPreferenceDTO(pref), nil
}

func (s *userServiceImpl) UpdatePreferences(ctx context.Context, userID int, req iam_dto.UpdatePreferenceRequest) (*iam_dto.UserPreferenceDTO, error) {
	if req.Locale != nil {
		normalized := i18n.NormalizeLocale(*req.Locale)
		if !i18n.IsValidLocale(normalized) {
			return nil, domain.ErrInvalidPreferenceLocale
		}
	}

	if req.Timezone != nil {
		tz := strings.TrimSpace(*req.Timezone)
		if _, err := time.LoadLocation(tz); err != nil {
			return nil, domain.ErrInvalidPreferenceTimezone
		}
	}

	if req.DateFormat != nil {
		df := strings.TrimSpace(*req.DateFormat)
		if !domain.IsValidDateFormat(df) {
			return nil, domain.ErrInvalidPreferenceDateFormat
		}
	}

	pref, err := s.resolveUserPreference(ctx, userID)
	if err != nil {
		return nil, err
	}

	if req.Locale != nil {
		pref.Locale = i18n.NormalizeLocale(*req.Locale)
	}
	if req.Theme != nil {
		pref.Theme = *req.Theme
	}
	if req.Timezone != nil {
		pref.Timezone = strings.TrimSpace(*req.Timezone)
	}
	if req.DateFormat != nil {
		pref.DateFormat = strings.TrimSpace(*req.DateFormat)
	}

	if err := s.userPrefRepo.Upsert(ctx, pref); err != nil {
		return nil, err
	}

	return &iam_dto.UserPreferenceDTO{
		UserID:     pref.UserID,
		Locale:     pref.Locale,
		Theme:      pref.Theme,
		Timezone:   pref.Timezone,
		DateFormat: pref.DateFormat,
		UpdatedAt:  time.Now(),
	}, nil
}
