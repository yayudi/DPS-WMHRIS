package mysql

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"context"

	iam_dto "github.com/dps-wmhris/backend/internal/modules/iam/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/jmoiron/sqlx"
)

type adminUserRepositoryImpl struct {
	database.BaseRepository[domain.User]
	db *sqlx.DB
}

// NewAdminUserRepository constructs a MySQL-backed AdminUserRepository.
func NewAdminUserRepository(db *sqlx.DB) port.AdminUserRepository {
	base := database.NewBaseRepository[domain.User](db, "users")
	return &adminUserRepositoryImpl{
		BaseRepository: base,
		db:             db,
	}
}

func (r *adminUserRepositoryImpl) FindAllActiveUsers(ctx context.Context) ([]iam_dto.AdminUserResponse, error) {
	query := `
		SELECT u.id, u.username, u.nickname, u.role_id, r.name AS role_name,
			   u.shift_id, s.name AS shift_name, u.exclude_from_attendance
		FROM users u
		LEFT JOIN roles r ON u.role_id = r.id
		LEFT JOIN shifts s ON u.shift_id = s.id
		WHERE u.is_active = 1
		ORDER BY u.username ASC
	`
	ext := database.GetExt(ctx, r.db)
	var users []iam_dto.AdminUserResponse
	err := ext.SelectContext(ctx, &users, query)
	if err != nil {
		return nil, err
	}
	if users == nil {
		users = []iam_dto.AdminUserResponse{}
	}
	return users, nil
}

func (r *adminUserRepositoryImpl) FindUserByID(ctx context.Context, userID int) (*domain.User, error) {
	var user domain.User
	query := `
		SELECT id, username, COALESCE(nickname, '') AS nickname, is_active, password_hash,
		       role_id, shift_id, created_at, updated_at, exclude_from_attendance
		FROM users
		WHERE id = ? AND is_active = 1
		LIMIT 1
	`
	ext := database.GetExt(ctx, r.db)
	if err := ext.GetContext(ctx, &user, query, userID); err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *adminUserRepositoryImpl) InsertUser(ctx context.Context, username, passwordHash string, roleID int, nickname *string, shiftID *int, excludeFromAttendance bool) (int, error) {
	query := `
		INSERT INTO users (username, password_hash, role_id, nickname, shift_id, exclude_from_attendance)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, username, passwordHash, roleID, nickname, shiftID, excludeFromAttendance)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func (r *adminUserRepositoryImpl) UpdateUserByID(ctx context.Context, userID int, params domain.UserUpdateParams) (int, error) {
	var fields []string
	var values []any

	if params.Username != nil {
		fields = append(fields, "username = ?")
		values = append(values, *params.Username)
	}
	if params.Nickname != nil {
		fields = append(fields, "nickname = ?")
		values = append(values, *params.Nickname)
	}
	if params.RoleID != nil {
		fields = append(fields, "role_id = ?")
		values = append(values, *params.RoleID)
	}
	if params.ShiftID != nil {
		fields = append(fields, "shift_id = ?")
		values = append(values, *params.ShiftID)
	}
	if params.ExcludeFromAttendance != nil {
		fields = append(fields, "exclude_from_attendance = ?")
		values = append(values, *params.ExcludeFromAttendance)
	}
	if params.PasswordHash != nil {
		fields = append(fields, "password_hash = ?")
		values = append(values, *params.PasswordHash)
	}

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

	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, values...)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *adminUserRepositoryImpl) SoftDeleteUser(ctx context.Context, userID int) (int, error) {
	query := "UPDATE users SET is_active = 0 WHERE id = ?"
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, userID)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

func (r *adminUserRepositoryImpl) FindUserLocationIDs(ctx context.Context, userID int) ([]int, error) {
	query := "SELECT location_id FROM user_locations WHERE user_id = ?"
	ext := database.GetExt(ctx, r.db)
	var locationIDs []int
	err := ext.SelectContext(ctx, &locationIDs, query, userID)
	if err != nil {
		return nil, err
	}
	if locationIDs == nil {
		locationIDs = []int{}
	}
	return locationIDs, nil
}

func (r *adminUserRepositoryImpl) DeleteUserLocations(ctx context.Context, userID int) error {
	ext := database.GetExt(ctx, r.db)
	query := "DELETE FROM user_locations WHERE user_id = ?"
	_, err := ext.ExecContext(ctx, query, userID)
	return err
}

func (r *adminUserRepositoryImpl) InsertUserLocations(ctx context.Context, userID int, locationIDs []int) error {
	if len(locationIDs) == 0 {
		return nil
	}
	query := "INSERT INTO user_locations (user_id, location_id) VALUES "
	var args []any
	for i, locID := range locationIDs {
		query += "(?, ?)"
		if i < len(locationIDs)-1 {
			query += ", "
		}
		args = append(args, userID, locID)
	}

	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, args...)
	return err
}
