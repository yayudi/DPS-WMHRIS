// Package port defines the inbound (use-case) and outbound (repository) interfaces for the IAM module.
package port

import (
	"context"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"
)

// UserUseCase defines authentication, self-service profile, and personal preference operations.
type UserUseCase interface {
	Login(ctx context.Context, req iam_dto.LoginRequest) (*iam_dto.LoginResponse, error)
	GetProfile(ctx context.Context, userID int) (*iam_dto.UserProfile, error)
	UpdateProfile(ctx context.Context, userID int, req iam_dto.UpdateProfileRequest, ip, userAgent string) (*iam_dto.UserProfile, error)
	GetMyLocations(ctx context.Context, userID int) ([]iam_dto.UserLocationResponse, error)
	GetPreferences(ctx context.Context, userID int) (*iam_dto.UserPreferenceDTO, error)
	UpdatePreferences(ctx context.Context, userID int, req iam_dto.UpdatePreferenceRequest) (*iam_dto.UserPreferenceDTO, error)
}

// RoleUseCase defines role and RBAC permission management operations.
type RoleUseCase interface {
	GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error)
	GetPermissions(ctx context.Context) ([]iam_dto.PermissionResponse, error)
	GetRolePermissions(ctx context.Context, roleID int) ([]int, error)
	UpdateRolePermissions(ctx context.Context, roleID int, req iam_dto.AssignPermissionsRequest, userID int, ip, userAgent string) error
	CreateRole(ctx context.Context, req iam_dto.CreateRoleRequest, userID int, ip, userAgent string) (int, error)
	UpdateRole(ctx context.Context, roleID int, req iam_dto.CreateRoleRequest, userID int, ip, userAgent string) error
	DeleteRole(ctx context.Context, roleID int, userID int, ip, userAgent string) error
}

// AdminUserUseCase defines administrative user management and location assignment operations.
type AdminUserUseCase interface {
	GetAllUsers(ctx context.Context) ([]iam_dto.AdminUserResponse, error)
	GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error)
	CreateUser(ctx context.Context, req iam_dto.AdminCreateUserRequest, adminID int, ip, userAgent string) (*iam_dto.AdminUserResponse, error)
	UpdateUser(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserRequest, adminID int, ip, userAgent string) error
	DeleteUser(ctx context.Context, targetID int, adminID int, ip, userAgent string) error
	GetUserLocations(ctx context.Context, targetID int) ([]int, error)
	UpdateUserLocations(ctx context.Context, targetID int, req iam_dto.AdminUpdateUserLocationsRequest, adminID int, ip, userAgent string) error
}
