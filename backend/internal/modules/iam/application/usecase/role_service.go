package usecase

import (
	"context"
	"errors"
	"log"
	"strconv"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type roleServiceImpl struct {
	txManager database.TransactionManager
	roleRepo  port.RoleRepository
	eventBus  eventbus.EventBus
}

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
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		err := s.roleRepo.DeleteRolePermissions(ctx, roleID)
		if err != nil {
			return err
		}

		err = s.roleRepo.InsertRolePermissions(ctx, roleID, req.PermissionIDs)
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		if database.IsForeignKeyViolation(err) {
			return errors.New("Role atau Permission ID tidak valid.")
		}
		return err
	}

	// Logging
	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes: map[string]interface{}{
			"note":            "Updated Role Permissions",
			"permissionCount": len(req.PermissionIDs),
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
			return 0, errors.New("Nama peran sudah digunakan.")
		}
		return 0, err
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes: map[string]interface{}{
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
			return errors.New("Nama peran sudah digunakan.")
		}
		return err
	}
	if !isUpdated {
		return errors.New("peran tidak ditemukan")
	}

	if errLog := eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes: map[string]interface{}{
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
	isDeleted, err := s.roleRepo.DeleteRole(ctx, roleID)
	if err != nil {
		return err // ER_ROW_IS_REFERENCED_2 handling needed later
	}
	if !isDeleted {
		return errors.New("peran tidak ditemukan")
	}

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
