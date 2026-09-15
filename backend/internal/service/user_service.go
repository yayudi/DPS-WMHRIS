package service

import (
	"log"
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/dps-wmhris/backend/internal/config"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

type UserService interface {
	Login(ctx context.Context, req dto.LoginRequest) (*dto.LoginResponse, error)
	GetProfile(ctx context.Context, userID int) (*dto.UserProfile, error)
	UpdateProfile(ctx context.Context, userID int, req dto.UpdateProfileRequest, ip, userAgent string) (*dto.UserProfile, error)
	GetMyLocations(ctx context.Context, userID int) ([]dto.UserLocationResponse, error)
}

type userServiceImpl struct {
	db            *sqlx.DB
	userRepo      repository.UserRepository
	systemLogRepo repository.SystemLogRepository
}

func NewUserService(db *sqlx.DB, userRepo repository.UserRepository, systemLogRepo repository.SystemLogRepository) UserService {
	return &userServiceImpl{
		db:            db,
		userRepo:      userRepo,
		systemLogRepo: systemLogRepo,
	}
}

func (s *userServiceImpl) Login(ctx context.Context, req dto.LoginRequest) (*dto.LoginResponse, error) {
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

	return &dto.LoginResponse{
		Token: tokenString,
		UserInfo: dto.UserProfile{
			ID:          user.ID,
			Username:    user.Username,
			Nickname:    user.Nickname,
			RoleID:      user.RoleID,
			Permissions: permissions,
		},
	}, nil
}

func (s *userServiceImpl) GetProfile(ctx context.Context, userID int) (*dto.UserProfile, error) {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, errors.New("user tidak ditemukan")
	}

	_, permissions, _ := s.userRepo.GetRoleAndPermissions(ctx, user.RoleID)

	return &dto.UserProfile{
		ID:          user.ID,
		Username:    user.Username,
		Nickname:    user.Nickname,
		RoleID:      user.RoleID,
		Permissions: permissions,
	}, nil
}

func (s *userServiceImpl) UpdateProfile(ctx context.Context, userID int, req dto.UpdateProfileRequest, ip, userAgent string) (*dto.UserProfile, error) {
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

	err = s.userRepo.UpdateProfile(ctx, s.db, userID, req.Nickname, hashedNewPassword)
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
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(userID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return &dto.UserProfile{
		ID:       updatedUser.ID,
		Username: updatedUser.Username,
		Nickname: updatedUser.Nickname,
		RoleID:   updatedUser.RoleID,
	}, nil
}

func (s *userServiceImpl) GetMyLocations(ctx context.Context, userID int) ([]dto.UserLocationResponse, error) {
	return s.userRepo.GetUserLocations(ctx, userID)
}
