// Package usecase implements the application business logic for the IAM bounded context.
package usecase

import (
	"context"
	"log"
	"strconv"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
)

type roleServiceImpl struct {
	txManager database.TransactionManager
	roleRepo  port.RoleRepository
	eventBus  eventbus.EventBus
}

// NewRoleUseCase constructs a RoleUseCase implementation backed by a TransactionManager, RoleRepository, and EventBus.
func NewRoleUseCase(txManager database.TransactionManager, roleRepo port.RoleRepository, eventBus eventbus.EventBus) port.RoleUseCase {
	return &roleServiceImpl{
		txManager: txManager,
		roleRepo:  roleRepo,
		eventBus:  eventBus,
	}
}

func (s *roleServiceImpl) GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error) {
	return s.roleRepo.GetRoles(ctx)
}

func (s *roleServiceImpl) GetPermissions(ctx context.Context) ([]iam_dto.PermissionResponse, error) {
	return s.roleRepo.GetPermissions(ctx)
}

func (s *roleServiceImpl) GetRolePermissions(ctx context.Context, roleID int) ([]int, error) {
	return s.roleRepo.GetRolePermissions(ctx, roleID)
}

func (s *roleServiceImpl) UpdateRolePermissions(ctx context.Context, roleID int, req iam_dto.AssignPermissionsRequest, userID int, ip, userAgent string) error {
	uniquePermIDs := deduplicatePositiveIDs(req.PermissionIDs)

	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		if err := s.roleRepo.DeleteRolePermissions(ctx, roleID); err != nil {
			return err
		}
		return s.roleRepo.InsertRolePermissions(ctx, roleID, uniquePermIDs)
	})
	if err != nil {
		if database.IsForeignKeyViolation(err) {
			return apperror.Validation("settings.roles.invalid_role_or_permission", "Role atau Permission ID tidak valid.")
		}
		return err
	}

	// Invalidate in-memory RBAC permission cache so updated permissions take effect immediately.
	middleware.ClearPermissionCache(roleID)

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes: map[string]any{
			"note":            "Updated Role Permissions",
			"permissionCount": len(uniquePermIDs),
		},
		IP:        ip,
		UserAgent: userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}

func (s *roleServiceImpl) CreateRole(ctx context.Context, req iam_dto.CreateRoleRequest, userID int, ip, userAgent string) (int, error) {
	roleID, err := s.roleRepo.CreateRole(ctx, req.Name, req.Description)
	if err != nil {
		if database.IsDuplicateKey(err) {
			return 0, apperror.Conflict("settings.roles.name_in_use", "Nama peran sudah digunakan.")
		}
		return 0, err
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes: map[string]any{
			"name":        req.Name,
			"description": req.Description,
		},
		IP:        ip,
		UserAgent: userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return roleID, nil
}

func (s *roleServiceImpl) UpdateRole(ctx context.Context, roleID int, req iam_dto.CreateRoleRequest, userID int, ip, userAgent string) error {
	isUpdated, err := s.roleRepo.UpdateRole(ctx, roleID, req.Name, req.Description)
	if err != nil {
		if database.IsDuplicateKey(err) {
			return apperror.Conflict("settings.roles.name_in_use", "Nama peran sudah digunakan.")
		}
		return err
	}
	if !isUpdated {
		return apperror.NotFound("settings.roles.role_not_found", "peran tidak ditemukan")
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes: map[string]any{
			"name":        req.Name,
			"description": req.Description,
		},
		IP:        ip,
		UserAgent: userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}

func (s *roleServiceImpl) DeleteRole(ctx context.Context, roleID int, userID int, ip, userAgent string) error {
	if roleID == domain.SuperAdminRoleID {
		return apperror.Forbidden("settings.roles.cannot_delete_superadmin", "Peran Super Admin tidak dapat dihapus.")
	}

	isDeleted, err := s.roleRepo.DeleteRole(ctx, roleID)
	if err != nil {
		if database.IsForeignKeyViolation(err) {
			return apperror.Conflict("settings.roles.role_in_use", "Peran tidak dapat dihapus karena masih digunakan oleh pengguna.")
		}
		return err
	}
	if !isDeleted {
		return apperror.NotFound("settings.roles.role_not_found", "peran tidak ditemukan")
	}

	middleware.ClearPermissionCache(roleID)

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes:    `{"note": "Deleted Role"}`,
		IP:         ip,
		UserAgent:  userAgent,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}

func deduplicatePositiveIDs(ids []int) []int {
	if len(ids) == 0 {
		return nil
	}
	seen := make(map[int]struct{}, len(ids))
	result := make([]int, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, exists := seen[id]; !exists {
			seen[id] = struct{}{}
			result = append(result, id)
		}
	}
	return result
}
