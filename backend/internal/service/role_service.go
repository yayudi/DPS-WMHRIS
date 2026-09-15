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
)

type RoleService interface {
	GetRoles(ctx context.Context) ([]dto.RoleResponse, error)
	GetPermissions(ctx context.Context) ([]dto.PermissionResponse, error)
	GetRolePermissions(ctx context.Context, roleID int) ([]int, error)
	UpdateRolePermissions(ctx context.Context, roleID int, req dto.AssignPermissionsRequest, userID int, ip, userAgent string) error
	CreateRole(ctx context.Context, req dto.CreateRoleRequest, userID int, ip, userAgent string) (int, error)
	UpdateRole(ctx context.Context, roleID int, req dto.CreateRoleRequest, userID int, ip, userAgent string) error
	DeleteRole(ctx context.Context, roleID int, userID int, ip, userAgent string) error
}

type roleServiceImpl struct {
	db            *sqlx.DB
	roleRepo      repository.RoleRepository
	systemLogRepo repository.SystemLogRepository
}

func NewRoleService(db *sqlx.DB, roleRepo repository.RoleRepository, systemLogRepo repository.SystemLogRepository) RoleService {
	return &roleServiceImpl{
		db:            db,
		roleRepo:      roleRepo,
		systemLogRepo: systemLogRepo,
	}
}

func (s *roleServiceImpl) GetRoles(ctx context.Context) ([]dto.RoleResponse, error) {
	return s.roleRepo.GetRoles(ctx)
}

func (s *roleServiceImpl) GetPermissions(ctx context.Context) ([]dto.PermissionResponse, error) {
	return s.roleRepo.GetPermissions(ctx)
}

func (s *roleServiceImpl) GetRolePermissions(ctx context.Context, roleID int) ([]int, error) {
	return s.roleRepo.GetRolePermissions(ctx, roleID)
}

func (s *roleServiceImpl) UpdateRolePermissions(ctx context.Context, roleID int, req dto.AssignPermissionsRequest, userID int, ip, userAgent string) error {
	err := database.WithTransaction(s.db, ctx, func(tx *sqlx.Tx) error {
		err := s.roleRepo.DeleteRolePermissions(ctx, tx, roleID)
		if err != nil {
			return err
		}

		err = s.roleRepo.InsertRolePermissions(ctx, tx, roleID, req.PermissionIDs)
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		if strings.Contains(err.Error(), "1452") || strings.Contains(err.Error(), "foreign key constraint fails") {
			return errors.New("Role atau Permission ID tidak valid.")
		}
		return err
	}

	// Logging
	changes := map[string]interface{}{
		"note":            "Updated Role Permissions",
		"permissionCount": len(req.PermissionIDs),
	}
	changesBytes, _ := json.Marshal(changes)
	changesStr := string(changesBytes)
	
	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}

func (s *roleServiceImpl) CreateRole(ctx context.Context, req dto.CreateRoleRequest, userID int, ip, userAgent string) (int, error) {
	roleID, err := s.roleRepo.CreateRole(ctx, req.Name, req.Description)
	if err != nil {
		if strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate entry") {
			return 0, errors.New("Nama peran sudah digunakan.")
		}
		return 0, err
	}

	changes := map[string]interface{}{
		"name":        req.Name,
		"description": req.Description,
	}
	changesBytes, _ := json.Marshal(changes)
	changesStr := string(changesBytes)
	
	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     userID,
		Action:     "CREATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return roleID, nil
}

func (s *roleServiceImpl) UpdateRole(ctx context.Context, roleID int, req dto.CreateRoleRequest, userID int, ip, userAgent string) error {
	isUpdated, err := s.roleRepo.UpdateRole(ctx, roleID, req.Name, req.Description)
	if err != nil {
		if strings.Contains(err.Error(), "1062") || strings.Contains(err.Error(), "Duplicate entry") {
			return errors.New("Nama peran sudah digunakan.")
		}
		return err
	}
	if !isUpdated {
		return errors.New("peran tidak ditemukan")
	}

	changes := map[string]interface{}{
		"name":        req.Name,
		"description": req.Description,
	}
	changesBytes, _ := json.Marshal(changes)
	changesStr := string(changesBytes)
	
	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     userID,
		Action:     "UPDATE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
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

	changes := map[string]interface{}{
		"note": "Deleted Role",
	}
	changesBytes, _ := json.Marshal(changes)
	changesStr := string(changesBytes)
	
	var ipPtr, uaPtr *string
	if ip != "" { ipPtr = &ip }
	if userAgent != "" { uaPtr = &userAgent }

	if errLog := s.systemLogRepo.Create(ctx, s.db, &model.SystemLog{
		UserID:     userID,
		Action:     "DELETE",
		TargetType: "ROLE",
		TargetID:   strconv.Itoa(roleID),
		Changes:    &changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}); errLog != nil {
		log.Printf("Failed to save system log: %v", errLog)
	}

	return nil
}
