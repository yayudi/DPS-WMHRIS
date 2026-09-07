package repository

import (
	"context"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

// RoleRepository defines the interface for role data operations
type RoleRepository interface {
	BaseRepository[model.Role]
	GetRoles(ctx context.Context) ([]dto.RoleResponse, error)
	GetPermissions(ctx context.Context) ([]dto.PermissionResponse, error)
	GetRolePermissions(ctx context.Context, roleID int) ([]int, error)
	DeleteRolePermissions(ctx context.Context, db sqlx.ExtContext, roleID int) error
	InsertRolePermissions(ctx context.Context, db sqlx.ExtContext, roleID int, permissionIDs []int) error
	CreateRole(ctx context.Context, name string, description *string) (int, error)
	UpdateRole(ctx context.Context, id int, name string, description *string) (bool, error)
	DeleteRole(ctx context.Context, id int) (bool, error)
}

type roleRepositoryImpl struct {
	BaseRepository[model.Role]
	db *sqlx.DB
}

// NewRoleRepository injects the database dependency
func (r *roleRepositoryImpl) GetRoles(ctx context.Context) ([]dto.RoleResponse, error) {
	query := "SELECT id, name, description FROM roles ORDER BY name"
	var roles []dto.RoleResponse
	err := r.db.SelectContext(ctx, &roles, query)
	if err != nil {
		return nil, err
	}
	if roles == nil {
		roles = []dto.RoleResponse{}
	}
	return roles, nil
}

func (r *roleRepositoryImpl) GetPermissions(ctx context.Context) ([]dto.PermissionResponse, error) {
	query := "SELECT id, name, description, `group` FROM permissions ORDER BY `group`, name"
	var permissions []dto.PermissionResponse
	err := r.db.SelectContext(ctx, &permissions, query)
	if err != nil {
		return nil, err
	}
	if permissions == nil {
		permissions = []dto.PermissionResponse{}
	}
	return permissions, nil
}

func (r *roleRepositoryImpl) GetRolePermissions(ctx context.Context, roleID int) ([]int, error) {
	query := "SELECT permission_id FROM role_permission WHERE role_id = ?"
	var permissionIDs []int
	err := r.db.SelectContext(ctx, &permissionIDs, query, roleID)
	if err != nil {
		return nil, err
	}
	if permissionIDs == nil {
		permissionIDs = []int{}
	}
	return permissionIDs, nil
}

func (r *roleRepositoryImpl) DeleteRolePermissions(ctx context.Context, db sqlx.ExtContext, roleID int) error {
	query := "DELETE FROM role_permission WHERE role_id = ?"
	_, err := db.ExecContext(ctx, query, roleID)
	return err
}

func (r *roleRepositoryImpl) InsertRolePermissions(ctx context.Context, db sqlx.ExtContext, roleID int, permissionIDs []int) error {
	if len(permissionIDs) == 0 {
		return nil
	}

	query := "INSERT INTO role_permission (role_id, permission_id) VALUES "
	var args []interface{}
	for i, pID := range permissionIDs {
		query += "(?, ?)"
		if i < len(permissionIDs)-1 {
			query += ", "
		}
		args = append(args, roleID, pID)
	}

	_, err := db.ExecContext(ctx, query, args...)
	return err
}

func (r *roleRepositoryImpl) CreateRole(ctx context.Context, name string, description *string) (int, error) {
	query := "INSERT INTO roles (name, description) VALUES (?, ?)"
	res, err := r.db.ExecContext(ctx, query, name, description)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *roleRepositoryImpl) UpdateRole(ctx context.Context, id int, name string, description *string) (bool, error) {
	query := "UPDATE roles SET name = ?, description = ? WHERE id = ?"
	res, err := r.db.ExecContext(ctx, query, name, description, id)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

func (r *roleRepositoryImpl) DeleteRole(ctx context.Context, id int) (bool, error) {
	query := "DELETE FROM roles WHERE id = ?"
	res, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	return affected > 0, err
}

func NewRoleRepository(db *sqlx.DB) RoleRepository {
	base := NewBaseRepository[model.Role](db, "roles")
	return &roleRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}
