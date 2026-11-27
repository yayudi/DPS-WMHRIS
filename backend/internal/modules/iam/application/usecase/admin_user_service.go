package usecase

import (
	"context"
	"log"
	"strconv"
	"strings"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"golang.org/x/crypto/bcrypt"
)

type adminUserServiceImpl struct {
	txManager     database.TransactionManager
	adminUserRepo port.AdminUserRepository
	roleRepo      port.RoleRepository
	eventBus      eventbus.EventBus
}

// NewAdminUserUseCase constructs an AdminUserUseCase implementation.
func NewAdminUserUseCase(txManager database.TransactionManager, adminUserRepo port.AdminUserRepository, roleRepo port.RoleRepository, eventBus eventbus.EventBus) port.AdminUserUseCase {
	return &adminUserServiceImpl{
		txManager:     txManager,
		adminUserRepo: adminUserRepo,
		roleRepo:      roleRepo,
		eventBus:      eventBus,
	}
}

func (s *adminUserServiceImpl) GetAllUsers(ctx context.Context) ([]iam_dto.AdminUserResponse, error) {
	return s.adminUserRepo.FindAllActiveUsers(ctx)
}

func (s *adminUserServiceImpl) GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error) {
	return s.roleRepo.GetRoles(ctx)
}

func (s *adminUserServiceImpl) CreateUser(ctx context.Context, req iam_dto.AdminCreateUserRequest, adminID int, ip, userAgent string) (*iam_dto.AdminUserResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, apperror.Internal("settings.user.hash_password_failed", "gagal memproses password", err)
	}

	insertID, err := s.adminUserRepo.InsertUser(
		ctx, req.Username, string(hash), req.RoleID, req.Nickname, req.ShiftID, req.ExcludeFromAttendance,
	)
	if err != nil {
		if database.IsDuplicateKey(err) || strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate entry") {
			return nil, apperror.Conflict("settings.user.username_in_use", "username sudah digunakan")
		}
		return nil, err
	}

	newUser := iam_dto.AdminUserResponse{
		ID:                    insertID,
		Username:              req.Username,
		Nickname:              req.Nickname,
		RoleID:                req.RoleID,
		ShiftID:               req.ShiftID,
		ExcludeFromAttendance: req.ExcludeFromAttendance,
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     adminID,
		Action:     "CREATE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(insertID),
		Changes:    newUser,
		IP:         ip,
		UserAgent:  userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return &newUser, nil
}

func (s *adminUserServiceImpl) UpdateUser(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserRequest, adminID int, ip, userAgent string) error {
	oldUser, err := s.adminUserRepo.FindUserByID(ctx, targetID)
	if err != nil || oldUser == nil {
		return apperror.NotFound("settings.user.user_not_found", "user tidak ditemukan")
	}

	var updateParams domain.UserUpdateParams
	changesRecord := make(map[string]any)

	if req.Username != nil && oldUser.Username != *req.Username {
		updateParams.Username = req.Username
		changesRecord["username"] = map[string]any{"old": oldUser.Username, "new": *req.Username}
	}

	if req.Nickname != nil {
		if oldUser.Nickname != *req.Nickname {
			updateParams.Nickname = req.Nickname
			changesRecord["nickname"] = map[string]any{"old": oldUser.Nickname, "new": *req.Nickname}
		}
	}

	if req.RoleID != nil && oldUser.RoleID != *req.RoleID {
		updateParams.RoleID = req.RoleID
		changesRecord["role_id"] = map[string]any{"old": oldUser.RoleID, "new": *req.RoleID}
	}

	if req.ShiftID != nil {
		if oldUser.ShiftID == nil || *oldUser.ShiftID != *req.ShiftID {
			updateParams.ShiftID = req.ShiftID
			changesRecord["shift_id"] = map[string]any{"old": oldUser.ShiftID, "new": *req.ShiftID}
		}
	}

	if req.ExcludeFromAttendance != nil {
		if oldUser.ExcludeFromAttendance != *req.ExcludeFromAttendance {
			updateParams.ExcludeFromAttendance = req.ExcludeFromAttendance
			changesRecord["exclude_from_attendance"] = map[string]any{"old": oldUser.ExcludeFromAttendance, "new": *req.ExcludeFromAttendance}
		}
	}

	if req.NewPassword != nil && *req.NewPassword != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return apperror.Internal("settings.user.hash_password_failed", "gagal memproses password", err)
		}
		hashStr := string(hash)
		updateParams.PasswordHash = &hashStr
		changesRecord["password"] = map[string]any{"old": "***", "new": "*** (changed)"}
	}

	if updateParams.HasUpdates() {
		_, err := s.adminUserRepo.UpdateUserByID(ctx, targetID, updateParams)
		if err != nil {
			if database.IsDuplicateKey(err) || strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate entry") {
				return apperror.Conflict("settings.user.username_in_use", "username sudah digunakan")
			}
			return err
		}
	}

	if len(changesRecord) > 0 {
		changesRecord["note"] = "Updated User Profile"
		if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
			UserID:     adminID,
			Action:     "UPDATE",
			TargetType: "USER",
			TargetID:   strconv.Itoa(targetID),
			Changes:    changesRecord,
			IP:         ip,
			UserAgent:  userAgent,
		}); errLog != nil {
			log.Printf("Failed to save system log: %v", errLog)
		}
	}

	return nil
}

func (s *adminUserServiceImpl) DeleteUser(ctx context.Context, targetID int, adminID int, ip, userAgent string) error {
	if adminID == targetID {
		return apperror.Forbidden("settings.user.cannot_delete_self", "anda tidak bisa menghapus akun anda sendiri")
	}

	affected, err := s.adminUserRepo.SoftDeleteUser(ctx, targetID)
	if err != nil {
		return err
	}
	if affected == 0 {
		return apperror.NotFound("settings.user.user_not_found", "user tidak ditemukan")
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     adminID,
		Action:     "DELETE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(targetID),
		Changes:    `{"note": "Soft Deleted User"}`,
		IP:         ip,
		UserAgent:  userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}

func (s *adminUserServiceImpl) GetUserLocations(ctx context.Context, targetID int) ([]int, error) {
	return s.adminUserRepo.FindUserLocationIDs(ctx, targetID)
}

func (s *adminUserServiceImpl) UpdateUserLocations(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserLocationsRequest, adminID int, ip, userAgent string) error {
	uniqueLocationIDs := deduplicatePositiveIDs(req.LocationIDs)

	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if err := s.adminUserRepo.DeleteUserLocations(ctx, targetID); err != nil {
			return err
		}
		return s.adminUserRepo.InsertUserLocations(ctx, targetID, uniqueLocationIDs)
	})
	if err != nil {
		return err
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     adminID,
		Action:     "UPDATE",
		TargetType: "USER",
		TargetID:   strconv.Itoa(targetID),
		Changes: map[string]any{
			"note":        "Updated User Locations",
			"locationIds": uniqueLocationIDs,
		},
		IP:        ip,
		UserAgent: userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}
