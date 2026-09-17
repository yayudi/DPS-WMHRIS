package port

import (
	"context"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	database "github.com/dps-wmhris/backend/internal/shared/database"
)

type AdminUserRepository interface {
	FindAllActiveUsers(ctx context.Context) ([]iam_dto.AdminUserResponse, error)
	FindUserByID(ctx context.Context, userID int) (*domain.User, error)
	InsertUser(ctx context.Context, username, passwordHash string, roleID int, nickname *string, shiftID *int, excludeFromAttendance bool) (int, error)
	UpdateUserByID(ctx context.Context, userID int, fields []string, values []interface{}) (int, error)
	SoftDeleteUser(ctx context.Context, userID int) (int, error)
	FindUserLocationIDs(ctx context.Context, userID int) ([]int, error)
	DeleteUserLocations(ctx context.Context, userID int) error
	InsertUserLocations(ctx context.Context, userID int, locationIDs []int) error
}

type RoleRepository interface {
	database.BaseRepository[domain.Role]
	GetRoles(ctx context.Context) ([]iam_dto.RoleResponse, error)
	GetPermissions(ctx context.Context) ([]iam_dto.PermissionResponse, error)
	GetRolePermissions(ctx context.Context, roleID int) ([]int, error)
	DeleteRolePermissions(ctx context.Context, roleID int) error
	InsertRolePermissions(ctx context.Context, roleID int, permissionIDs []int) error
	CreateRole(ctx context.Context, name string, description *string) (int, error)
	UpdateRole(ctx context.Context, id int, name string, description *string) (bool, error)
	DeleteRole(ctx context.Context, id int) (bool, error)
}

type UserRepository interface {
	database.BaseRepository[domain.User]
	GetAll(ctx context.Context) ([]domain.User, error)
	FindByUsername(ctx context.Context, username string) (*domain.User, error)
	GetRoleAndPermissions(ctx context.Context, roleID int) (string, []string, error)
	UpdateProfile(ctx context.Context, userID int, nickname *string, hashedPassword *string) error
	GetUserLocations(ctx context.Context, userID int) ([]iam_dto.UserLocationResponse, error)
	CheckUserLocationPermission(ctx context.Context, userID int, locationID int) (bool, error)
}
