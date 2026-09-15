package service

import (
	"log"
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/dps-wmhris/backend/internal/database"
	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"
)

type AdminUserService interface {
	GetAllUsers(ctx context.Context) ([]dto.AdminUserResponse, error)
	GetRoles(ctx context.Context) ([]dto.RoleResponse, error)
	CreateUser(ctx context.Context, req dto.AdminCreateUserRequest, adminID int, ip, userAgent string) (*dto.AdminUserResponse, error)
	UpdateUser(ctx context.Context, targetID int, req dto.AdminUpdateUserRequest, adminID int, ip, userAgent string) error
	DeleteUser(ctx context.Context, targetID int, adminID int, ip, userAgent string) error
	GetUserLocations(ctx context.Context, targetID int) ([]int, error)
	UpdateUserLocations(ctx context.Context, targetID int, req dto.AdminUpdateUserLocationsRequest, adminID int, ip, userAgent string) error
}

type adminUserServiceImpl struct {
	db            *sqlx.DB
	adminUserRepo repository.AdminUserRepository
	roleRepo      repository.RoleRepository
	systemLogRepo repository.SystemLogRepository
}

func NewAdminUserService(db *sqlx.DB, adminUserRepo repository.AdminUserRepository, roleRepo repository.RoleRepository, systemLogRepo repository.SystemLogRepository) AdminUserService {
	return &adminUserServiceImpl{
		db:            db,
		adminUserRepo: adminUserRepo,
		roleRepo:      roleRepo,
		systemLogRepo: systemLogRepo,
	}
}

func (s *adminUserServiceImpl) GetAllUsers(ctx context.Context) ([]dto.AdminUserResponse, error) {
	return s.adminUserRepo.FindAllActiveUsers(ctx)
}

func (s *adminUserServiceImpl) GetRoles(ctx context.Context) ([]dto.RoleResponse, error) {
	return s.roleRepo.GetRoles(ctx)
}

func (s *adminUserServiceImpl) CreateUser(ctx context.Context, req dto.AdminCreateUserRequest, adminID int, ip, userAgent string) (*dto.AdminUserResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("gagal memproses password")
	}

	insertID, err := s.adminUserRepo.InsertUser(
		ctx, req.Username, string(hash), req.RoleID, req.Nickname, req.ShiftID, req.ExcludeFromAttendance,
	)
	if err != nil {
		if strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate entry") {
			return nil, errors.New("Username sudah digunakan.")
		}
		return nil, err
	}

	newUser := dto.AdminUserResponse{
		ID:                    insertID,
		Username:              req.Username,
		Nickname:              req.Nickname,
		RoleID:                req.RoleID,
		ShiftID:               req.ShiftID,
		ExcludeFromAttendance: req.ExcludeFromAttendance,
	}

	changesBytes, _ := json.Marshal(newUser)
	changesStr := string(changesBytes)

	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     adminID,
		Action:     "CREATE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(insertID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return &newUser, nil
}

func (s *adminUserServiceImpl) UpdateUser(ctx context.Context, targetID int, req dto.AdminUpdateUserRequest, adminID int, ip, userAgent string) error {
	oldUser, err := s.adminUserRepo.FindUserByID(ctx, targetID)
	if err != nil {
		return errors.New("user tidak ditemukan")
	}
	if oldUser == nil {
		return errors.New("user tidak ditemukan")
	}

	var updateFields []string
	var updateValues []interface{}
	changesRecord := make(map[string]interface{})

	if req.Username != nil && oldUser.Username != *req.Username {
		updateFields = append(updateFields, "username = ?")
		updateValues = append(updateValues, *req.Username)
		changesRecord["username"] = map[string]interface{}{"old": oldUser.Username, "new": *req.Username}
	}

	if req.Nickname != nil {
		if oldUser.Nickname != *req.Nickname {
			updateFields = append(updateFields, "nickname = ?")
			updateValues = append(updateValues, *req.Nickname)
			changesRecord["nickname"] = map[string]interface{}{"old": oldUser.Nickname, "new": *req.Nickname}
		}
	}

	if req.RoleID != nil && oldUser.RoleID != *req.RoleID {
		updateFields = append(updateFields, "role_id = ?")
		updateValues = append(updateValues, *req.RoleID)
		changesRecord["role_id"] = map[string]interface{}{"old": oldUser.RoleID, "new": *req.RoleID}
	}

	if req.ShiftID != nil {
		if oldUser.ShiftID == nil || *oldUser.ShiftID != *req.ShiftID {
			updateFields = append(updateFields, "shift_id = ?")
			updateValues = append(updateValues, *req.ShiftID)
			changesRecord["shift_id"] = map[string]interface{}{"old": oldUser.ShiftID, "new": *req.ShiftID}
		}
	}

	if req.ExcludeFromAttendance != nil {
		if oldUser.ExcludeFromAttendance != *req.ExcludeFromAttendance {
			updateFields = append(updateFields, "exclude_from_attendance = ?")
			updateValues = append(updateValues, *req.ExcludeFromAttendance)
			changesRecord["exclude_from_attendance"] = map[string]interface{}{"old": oldUser.ExcludeFromAttendance, "new": *req.ExcludeFromAttendance}
		}
	}

	if req.NewPassword != nil && *req.NewPassword != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*req.NewPassword), bcrypt.DefaultCost)
		if err == nil {
			updateFields = append(updateFields, "password_hash = ?")
			updateValues = append(updateValues, string(hash))
			changesRecord["password"] = map[string]interface{}{"old": "***", "new": "*** (changed)"}
		}
	}

	if len(updateFields) > 0 {
		_, err := s.adminUserRepo.UpdateUserByID(ctx, targetID, updateFields, updateValues)
		if err != nil {
			if strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate entry") {
				return errors.New("Username sudah digunakan.")
			}
			return err
		}
	}

	if len(changesRecord) > 0 {
		changesRecord["note"] = "Updated User Profile"
		changesBytes, _ := json.Marshal(changesRecord)
		changesStr := string(changesBytes)

		var ipPtr, uaPtr *string
		if ip != "" { ipPtr = &ip }
		if userAgent != "" { uaPtr = &userAgent }

		if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
			UserID:     adminID,
			Action:     "UPDATE",
			TargetType: "USER",
			TargetID:   strconv.Itoa(targetID),
			Changes:    &changesStr,
			IP:         ipPtr,
			UserAgent:  uaPtr,
		}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}
	}

	return nil
}

func (s *adminUserServiceImpl) DeleteUser(ctx context.Context, targetID int, adminID int, ip, userAgent string) error {
	if adminID == targetID {
		return errors.New("anda tidak bisa menghapus akun anda sendiri")
	}

	affected, err := s.adminUserRepo.SoftDeleteUser(ctx, targetID)
	if err != nil {
		return err
	}
	if affected == 0 {
		return errors.New("user tidak ditemukan")
	}

	changes := map[string]interface{}{
		"note": "Soft Deleted User",
	}
	changesBytes, _ := json.Marshal(changes)
	changesStr := string(changesBytes)

	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     adminID,
		Action:     "DELETE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(targetID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}

func (s *adminUserServiceImpl) GetUserLocations(ctx context.Context, targetID int) ([]int, error) {
	return s.adminUserRepo.FindUserLocationIDs(ctx, targetID)
}

func (s *adminUserServiceImpl) UpdateUserLocations(ctx context.Context, targetID int, req dto.AdminUpdateUserLocationsRequest, adminID int, ip, userAgent string) error {
	err := database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		err := s.adminUserRepo.DeleteUserLocations(ctx, tx, targetID)
		if err != nil {
			return err
		}

		err = s.adminUserRepo.InsertUserLocations(ctx, tx, targetID, req.LocationIDs)
		if err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		return err
	}

	changes := map[string]interface{}{
		"note": "Updated User Locations",
		"locationIds": req.LocationIDs,
	}
	changesBytes, _ := json.Marshal(changes)
	changesStr := string(changesBytes)

	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     adminID,
		Action:     "UPDATE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(targetID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}
