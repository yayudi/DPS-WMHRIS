package repository

import (
	"context"
	"database/sql"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

// UserRepository defines the interface for user data operations
type UserRepository interface {
	BaseRepository[model.User]
	GetAll(ctx context.Context) ([]model.User, error)
	FindByUsername(ctx context.Context, username string) (*model.User, error)
	GetRoleAndPermissions(ctx context.Context, roleID int) (string, []string, error)
	UpdateProfile(ctx context.Context, db sqlx.ExtContext, userID int, nickname *string, hashedPassword *string) error
	GetUserLocations(ctx context.Context, userID int) ([]dto.UserLocationResponse, error)
	CheckUserLocationPermission(ctx context.Context, userID int, locationID int) (bool, error)
}

type userRepositoryImpl struct {
	BaseRepository[model.User]
	db *sqlx.DB
}

// NewUserRepository injects the database dependency
func NewUserRepository(db *sqlx.DB) UserRepository {
	base := NewBaseRepository[model.User](db, "users")
	return &userRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *userRepositoryImpl) GetAll(ctx context.Context) ([]model.User, error) {
	var users []model.User
	query := `
		SELECT 
			id, username, nickname, is_active, password_hash, role_id, 
			shift_id, created_at, updated_at, exclude_from_attendance 
		FROM users 
		WHERE is_active = 1
		ORDER BY username ASC`
	
	err := r.db.SelectContext(ctx, &users, query)
	return users, err
}

func (r *userRepositoryImpl) FindByUsername(ctx context.Context, username string) (*model.User, error) {
	var user model.User
	query := `
		SELECT 
			id, username, nickname, is_active, password_hash, role_id, 
			shift_id, created_at, updated_at, exclude_from_attendance 
		FROM users 
		WHERE username = ? LIMIT 1`
		
	err := r.db.GetContext(ctx, &user, query, username)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *userRepositoryImpl) GetRoleAndPermissions(ctx context.Context, roleID int) (string, []string, error) {
	query := `
		SELECT r.name as role, p.name as permission
		FROM roles r
		LEFT JOIN role_permission rp ON r.id = rp.role_id
		LEFT JOIN permissions p ON rp.permission_id = p.id
		WHERE r.id = ?
	`
	
	type RolePerm struct {
		Role       string  `db:"role"`
		Permission *string `db:"permission"`
	}
	
	var rows []RolePerm
	err := r.db.SelectContext(ctx, &rows, query, roleID)
	if err != nil {
		return "", nil, err
	}
	
	if len(rows) == 0 {
		return "user", []string{}, nil
	}
	
	role := rows[0].Role
	if role == "" {
		role = "user"
	}
	
	var permissions []string
	for _, row := range rows {
		if row.Permission != nil && *row.Permission != "" {
			permissions = append(permissions, *row.Permission)
		}
	}
	
	return role, permissions, nil
}

func (r *userRepositoryImpl) UpdateProfile(ctx context.Context, db sqlx.ExtContext, userID int, nickname *string, hashedPassword *string) error {
	var updateFields []string
	var args []interface{}
	
	if nickname != nil {
		updateFields = append(updateFields, "nickname = ?")
		args = append(args, *nickname)
	}
	
	if hashedPassword != nil {
		updateFields = append(updateFields, "password_hash = ?")
		args = append(args, *hashedPassword)
	}
	
	if len(updateFields) == 0 {
		return nil
	}
	
	query := "UPDATE users SET "
	for i, field := range updateFields {
		query += field
		if i < len(updateFields)-1 {
			query += ", "
		}
	}
	query += " WHERE id = ?"
	args = append(args, userID)
	
	_, err := db.ExecContext(ctx, query, args...)
	return err
}

func (r *userRepositoryImpl) GetUserLocations(ctx context.Context, userID int) ([]dto.UserLocationResponse, error) {
	query := `
		SELECT l.id, l.code, l.building, COALESCE(CAST(l.floor AS CHAR), '') as floor, COALESCE(l.name, '') as name
		FROM locations l
		JOIN user_locations ul ON l.id = ul.location_id
		WHERE ul.user_id = ?
		ORDER BY l.id ASC
	`
	
	var locations []dto.UserLocationResponse
	err := r.db.SelectContext(ctx, &locations, query, userID)
	if err != nil {
		return nil, err
	}
	if locations == nil {
		locations = []dto.UserLocationResponse{}
	}
	
	return locations, nil
}

func (r *userRepositoryImpl) CheckUserLocationPermission(ctx context.Context, userID int, locationID int) (bool, error) {
	query := "SELECT 1 FROM user_locations WHERE user_id = ? AND location_id = ?"
	var exists int
	err := r.db.GetContext(ctx, &exists, query, userID, locationID)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
