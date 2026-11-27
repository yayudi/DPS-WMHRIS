package mysql

import (
	"context"
	"database/sql"
	"errors"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	"github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

const shiftSelectColumns = `
	id, name, start_time, end_time,
	COALESCE(work_days, '1,2,3,4,5') AS work_days,
	COALESCE(flexible_minutes, 0) AS flexible_minutes,
	COALESCE(is_default, 0) AS is_default,
	created_at, updated_at
`

type shiftRepositoryImpl struct {
	db *sqlx.DB
}

// NewShiftRepository creates a MySQL-backed ShiftRepository.
func NewShiftRepository(db *sqlx.DB) port.ShiftRepository {
	return &shiftRepositoryImpl{db: db}
}

func (r *shiftRepositoryImpl) GetAll(ctx context.Context) ([]domain.Shift, error) {
	ext := database.GetExt(ctx, r.db)
	shifts := make([]domain.Shift, 0)
	query := `SELECT ` + shiftSelectColumns + ` FROM shifts ORDER BY id ASC`
	if err := ext.SelectContext(ctx, &shifts, query); err != nil {
		return nil, err
	}
	if shifts == nil {
		return []domain.Shift{}, nil
	}
	return shifts, nil
}

func (r *shiftRepositoryImpl) GetByID(ctx context.Context, id int) (*domain.Shift, error) {
	ext := database.GetExt(ctx, r.db)
	var shift domain.Shift
	query := `SELECT ` + shiftSelectColumns + ` FROM shifts WHERE id = ?`
	if err := ext.GetContext(ctx, &shift, query, id); err != nil {
		return nil, err
	}
	return &shift, nil
}

func (r *shiftRepositoryImpl) Create(ctx context.Context, shift *domain.Shift) (int, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO shifts (name, start_time, end_time, work_days, flexible_minutes, is_default)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	result, err := ext.ExecContext(ctx, query,
		shift.Name, shift.StartTime, shift.EndTime, shift.WorkDays, shift.FlexibleMinutes, shift.IsDefault,
	)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	return int(id), nil
}

func (r *shiftRepositoryImpl) Update(ctx context.Context, shift *domain.Shift) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		UPDATE shifts
		SET name = ?, start_time = ?, end_time = ?, work_days = ?, flexible_minutes = ?, is_default = ?
		WHERE id = ?
	`
	_, err := ext.ExecContext(ctx, query,
		shift.Name, shift.StartTime, shift.EndTime, shift.WorkDays, shift.FlexibleMinutes, shift.IsDefault, shift.ID,
	)
	return err
}

func (r *shiftRepositoryImpl) Delete(ctx context.Context, id int) error {
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, `DELETE FROM shifts WHERE id = ?`, id)
	return err
}

func (r *shiftRepositoryImpl) ClearDefault(ctx context.Context) error {
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, `UPDATE shifts SET is_default = false`)
	return err
}

func (r *shiftRepositoryImpl) GetUserShift(ctx context.Context, username string) (*domain.Shift, error) {
	ext := database.GetExt(ctx, r.db)
	var shift domain.Shift

	// Priority 1: User's explicitly assigned shift (INNER JOIN avoids scanning NULL columns when shift_id is NULL).
	queryUserShift := `
		SELECT
			s.id, s.name, s.start_time, s.end_time,
			COALESCE(s.work_days, '1,2,3,4,5') AS work_days,
			COALESCE(s.flexible_minutes, 0) AS flexible_minutes,
			COALESCE(s.is_default, 0) AS is_default,
			s.created_at, s.updated_at
		FROM users u
		INNER JOIN shifts s ON u.shift_id = s.id
		WHERE u.username = ?
	`
	err := ext.GetContext(ctx, &shift, queryUserShift, username)
	if err == nil {
		return &shift, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// Priority 2: Fallback to default shift
	queryDefault := `SELECT ` + shiftSelectColumns + ` FROM shifts WHERE is_default = 1 LIMIT 1`
	if err := ext.GetContext(ctx, &shift, queryDefault); err != nil {
		return nil, err
	}
	return &shift, nil
}
