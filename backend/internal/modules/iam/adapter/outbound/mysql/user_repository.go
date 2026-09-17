package mysql

import (
	"context"
	"database/sql"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

// UserRepository defines the interface for user data operations

type userRepositoryImpl struct {
	database.BaseRepository[domain.User]
	db *sqlx.DB
}

// NewUserRepository injects the database dependency
func NewUserRepository(db *sqlx.DB) port.UserRepository {
	base := database.NewBaseRepository[domain.User](db, "users")
	return &userRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *userRepositoryImpl) GetAll(ctx context.Context) ([]domain.User, error) {
	var users []domain.User
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

func (r *userRepositoryImpl) FindByUsername(ctx context.Context, username string) (*domain.User, error) {
	var user domain.User
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

func (r *userRepositoryImpl) UpdateProfile(ctx context.Context, userID int, nickname *string, hashedPassword *string) error {
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

	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, args...)
	return err
}

func (r *userRepositoryImpl) GetUserLocations(ctx context.Context, userID int) ([]iam_dto.UserLocationResponse, error) {
	query := `
		SELECT l.id, l.code, l.building, COALESCE(CAST(l.floor AS CHAR), '') as floor, COALESCE(l.name, '') as name
		FROM locations l
		JOIN user_locations ul ON l.id = ul.location_id
		WHERE ul.user_id = ?
		ORDER BY l.id ASC
	`

	var locations []iam_dto.UserLocationResponse
	err := r.db.SelectContext(ctx, &locations, query, userID)
	if err != nil {
		return nil, err
	}
	if locations == nil {
		locations = []iam_dto.UserLocationResponse{}
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
