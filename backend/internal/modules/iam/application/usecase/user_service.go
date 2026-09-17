package usecase

import (
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	"context"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"time"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type userServiceImpl struct {
	txManager database.TransactionManager
	userRepo  port.UserRepository
	eventBus  eventbus.EventBus
}

func NewUserUseCase(txManager database.TransactionManager, userRepo port.UserRepository, eventBus eventbus.EventBus) port.UserUseCase {
	return &userServiceImpl{
		txManager: txManager,
		userRepo:  userRepo,
		eventBus:  eventBus,
	}
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

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":       user.ID, // Note: standardizing to 'id' since it might be used by auth middleware
		"user_id":  user.ID,
		"username": user.Username,
		"role_id":  user.RoleID,
		"role":     role,
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
		},
	}, nil
}

func (s *userServiceImpl) GetProfile(ctx context.Context, userID int) (*iam_dto.UserProfile, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, errors.New("user tidak ditemukan")
	}

	_, permissions, _ := s.userRepo.GetRoleAndPermissions(ctx, user.RoleID)

	return &iam_dto.UserProfile{
		ID:          user.ID,
		Username:    user.Username,
		Nickname:    user.Nickname,
		RoleID:      user.RoleID,
		Permissions: permissions,
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
	changesStr := string(changesBytes)

	var ipPtr, uaPtr *string
	if ip != "" {
		ipPtr = &ip
	}
	if userAgent != "" {
		uaPtr = &userAgent
	}

	if errLog := s.eventBus.Publish(ctx, eventbus.NewEvent(
		system_domain.EventSystemLog,
		system_domain.SystemLogPayload{
			Action:     "UPDATE",
			TargetType: "USER",
			TargetID:   strconv.Itoa(userID),
			Changes:    &changesStr,
			IP:         ipPtr,
			UserAgent:  uaPtr,
		},
		userID,
	)); errLog != nil {
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
