package mysql

import (
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"context"

	"github.com/dps-wmhris/backend/internal/modules/hris/port"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	"github.com/jmoiron/sqlx"
)

// ShiftRepository defines the interface for shift data operations

type shiftRepositoryImpl struct {
	db *sqlx.DB
}

// NewShiftRepository injects the database dependency
func NewShiftRepository(db *sqlx.DB) port.ShiftRepository {
	return &shiftRepositoryImpl{db: db}
}

func (r *shiftRepositoryImpl) GetAll(ctx context.Context) ([]domain.Shift, error) {
	ext := database.GetExt(ctx, r.db)
	var shifts []domain.Shift
	query := `SELECT * FROM shifts ORDER BY name ASC`
	err := ext.SelectContext(ctx, &shifts, query)
	if err != nil {
		return nil, err
	}
	return shifts, nil
}

func (r *shiftRepositoryImpl) GetByID(ctx context.Context, id int) (*domain.Shift, error) {
	ext := database.GetExt(ctx, r.db)
	var shift domain.Shift
	query := `SELECT * FROM shifts WHERE id = ?`
	err := ext.GetContext(ctx, &shift, query, id)
	if err != nil {
		return nil, err
	}
	return &shift, nil
}

func (r *shiftRepositoryImpl) Create(ctx context.Context, shift *domain.Shift) (int, error) {
	ext := database.GetExt(ctx, r.db)
	if ext == nil {
		ext = r.db
	}
	query := `
		INSERT INTO shifts (name, start_time, end_time, work_days, flexible_minutes, is_default) 
		VALUES (?, ?, ?, ?, ?, ?)`
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
	if ext == nil {
		ext = r.db
	}
	query := `
		UPDATE shifts 
		SET name = ?, start_time = ?, end_time = ?, work_days = ?, flexible_minutes = ?, is_default = ? 
		WHERE id = ?`
	_, err := ext.ExecContext(ctx, query,
		shift.Name, shift.StartTime, shift.EndTime, shift.WorkDays, shift.FlexibleMinutes, shift.IsDefault, shift.ID,
	)
	return err
}

func (r *shiftRepositoryImpl) Delete(ctx context.Context, id int) error {
	ext := database.GetExt(ctx, r.db)
	if ext == nil {
		ext = r.db
	}
	query := `DELETE FROM shifts WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, id)
	return err
}

// ClearDefault resets all shifts' is_default to false. Used transactionally.
func (r *shiftRepositoryImpl) ClearDefault(ctx context.Context) error {
	ext := database.GetExt(ctx, r.db)
	if ext == nil {
		ext = r.db
	}
	query := `UPDATE shifts SET is_default = false`
	_, err := ext.ExecContext(ctx, query)
	return err
}

func (r *shiftRepositoryImpl) GetUserShift(ctx context.Context, username string) (*domain.Shift, error) {
	ext := database.GetExt(ctx, r.db)
	var shift domain.Shift
	// Priority 1: User's assigned shift
	queryUserShift := `
		SELECT s.* 
		FROM users u 
		LEFT JOIN shifts s ON u.shift_id = s.id 
		WHERE u.username = ?`

	err := ext.GetContext(ctx, &shift, queryUserShift, username)
	if err == nil && shift.ID != 0 {
		return &shift, nil
	}

	// Priority 2: Default shift
	queryDefault := `SELECT * FROM shifts WHERE is_default = 1 LIMIT 1`
	err = r.db.GetContext(ctx, &shift, queryDefault)
	if err != nil {
		return nil, err
	}

	return &shift, nil
}
