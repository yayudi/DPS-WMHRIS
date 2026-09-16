package repository

import (
	"context"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/modules/iam/model"
	"github.com/jmoiron/sqlx"
)

type AdminUserRepository interface {
	FindAllActiveUsers(ctx context.Context) ([]dto.AdminUserResponse, error)
	FindUserByID(ctx context.Context, userID int) (*model.User, error)
	InsertUser(ctx context.Context, username, passwordHash string, roleID int, nickname *string, shiftID *int, excludeFromAttendance bool) (int, error)
	UpdateUserByID(ctx context.Context, userID int, fields []string, values []interface{}) (int, error)
	SoftDeleteUser(ctx context.Context, userID int) (int, error)
	FindUserLocationIDs(ctx context.Context, userID int) ([]int, error)
	DeleteUserLocations(ctx context.Context, tx sqlx.ExtContext, userID int) error
	InsertUserLocations(ctx context.Context, tx sqlx.ExtContext, userID int, locationIDs []int) error
}

type adminUserRepositoryImpl struct {
	db *sqlx.DB
}

func NewAdminUserRepository(db *sqlx.DB) AdminUserRepository {
	return &adminUserRepositoryImpl{db: db}
}

func (r *adminUserRepositoryImpl) FindAllActiveUsers(ctx context.Context) ([]dto.AdminUserResponse, error) {
	query := `
		SELECT u.id, u.username, u.nickname, u.role_id, r.name AS role_name,
			   u.shift_id, s.name AS shift_name, u.exclude_from_attendance
		FROM users u
		LEFT JOIN roles r ON u.role_id = r.id
		LEFT JOIN shifts s ON u.shift_id = s.id
		WHERE u.is_active = 1
		ORDER BY u.username ASC
	`
	var users []dto.AdminUserResponse
	err := r.db.SelectContext(ctx, &users, query)
	if err != nil {
		return nil, err
	}
	if users == nil {
		users = []dto.AdminUserResponse{}
	}
	return users, nil
}

func (r *adminUserRepositoryImpl) FindUserByID(ctx context.Context, userID int) (*model.User, error) {
	query := "SELECT id, username, nickname, role_id, shift_id, exclude_from_attendance FROM users WHERE id = ?"
	var user model.User
	err := r.db.GetContext(ctx, &user, query, userID)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *adminUserRepositoryImpl) InsertUser(ctx context.Context, username, passwordHash string, roleID int, nickname *string, shiftID *int, excludeFromAttendance bool) (int, error) {
	query := `
		INSERT INTO users (username, password_hash, role_id, nickname, shift_id, exclude_from_attendance)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	res, err := r.db.ExecContext(ctx, query, username, passwordHash, roleID, nickname, shiftID, excludeFromAttendance)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *adminUserRepositoryImpl) UpdateUserByID(ctx context.Context, userID int, fields []string, values []interface{}) (int, error) {
	if len(fields) == 0 {
		return 0, nil
	}
	query := "UPDATE users SET "
	for i, field := range fields {
		query += field
		if i < len(fields)-1 {
			query += ", "
		}
	}
	query += " WHERE id = ?"
	values = append(values, userID)

	res, err := r.db.ExecContext(ctx, query, values...)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *adminUserRepositoryImpl) SoftDeleteUser(ctx context.Context, userID int) (int, error) {
	query := "UPDATE users SET is_active = 0 WHERE id = ?"
	res, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *adminUserRepositoryImpl) FindUserLocationIDs(ctx context.Context, userID int) ([]int, error) {
	query := "SELECT location_id FROM user_locations WHERE user_id = ?"
	var locationIDs []int
	err := r.db.SelectContext(ctx, &locationIDs, query, userID)
	if err != nil {
		return nil, err
	}
	if locationIDs == nil {
		locationIDs = []int{}
	}
	return locationIDs, nil
}

func (r *adminUserRepositoryImpl) DeleteUserLocations(ctx context.Context, tx sqlx.ExtContext, userID int) error {
	query := "DELETE FROM user_locations WHERE user_id = ?"
	_, err := tx.ExecContext(ctx, query, userID)
	return err
}

func (r *adminUserRepositoryImpl) InsertUserLocations(ctx context.Context, tx sqlx.ExtContext, userID int, locationIDs []int) error {
	if len(locationIDs) == 0 {
		return nil
	}
	query := "INSERT INTO user_locations (user_id, location_id) VALUES "
	var args []interface{}
	for i, locID := range locationIDs {
		query += "(?, ?)"
		if i < len(locationIDs)-1 {
			query += ", "
		}
		args = append(args, userID, locID)
	}

	_, err := tx.ExecContext(ctx, query, args...)
	return err
}
