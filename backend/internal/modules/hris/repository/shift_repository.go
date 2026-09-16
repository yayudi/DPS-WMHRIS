package repository

import (
	"context"

	"github.com/dps-wmhris/backend/internal/modules/hris/model"
	"github.com/jmoiron/sqlx"
)

// ShiftRepository defines the interface for shift data operations
type ShiftRepository interface {
	GetAll(ctx context.Context) ([]model.Shift, error)
	GetByID(ctx context.Context, id int) (*model.Shift, error)
	Create(ctx context.Context, ext sqlx.ExtContext, shift *model.Shift) (int, error)
	Update(ctx context.Context, ext sqlx.ExtContext, shift *model.Shift) error
	Delete(ctx context.Context, ext sqlx.ExtContext, id int) error
	ClearDefault(ctx context.Context, ext sqlx.ExtContext) error
	GetUserShift(ctx context.Context, username string) (*model.Shift, error)
}

type shiftRepositoryImpl struct {
	db *sqlx.DB
}

// NewShiftRepository injects the database dependency
func NewShiftRepository(db *sqlx.DB) ShiftRepository {
	return &shiftRepositoryImpl{db: db}
}

func (r *shiftRepositoryImpl) GetAll(ctx context.Context) ([]model.Shift, error) {
	var shifts []model.Shift
	query := `SELECT * FROM shifts ORDER BY name ASC`
	err := r.db.SelectContext(ctx, &shifts, query)
	if err != nil {
		return nil, err
	}
	return shifts, nil
}

func (r *shiftRepositoryImpl) GetByID(ctx context.Context, id int) (*model.Shift, error) {
	var shift model.Shift
	query := `SELECT * FROM shifts WHERE id = ?`
	err := r.db.GetContext(ctx, &shift, query, id)
	if err != nil {
		return nil, err
	}
	return &shift, nil
}

func (r *shiftRepositoryImpl) Create(ctx context.Context, ext sqlx.ExtContext, shift *model.Shift) (int, error) {
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

func (r *shiftRepositoryImpl) Update(ctx context.Context, ext sqlx.ExtContext, shift *model.Shift) error {
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

func (r *shiftRepositoryImpl) Delete(ctx context.Context, ext sqlx.ExtContext, id int) error {
	if ext == nil {
		ext = r.db
	}
	query := `DELETE FROM shifts WHERE id = ?`
	_, err := ext.ExecContext(ctx, query, id)
	return err
}

// ClearDefault resets all shifts' is_default to false. Used transactionally.
func (r *shiftRepositoryImpl) ClearDefault(ctx context.Context, ext sqlx.ExtContext) error {
	if ext == nil {
		ext = r.db
	}
	query := `UPDATE shifts SET is_default = false`
	_, err := ext.ExecContext(ctx, query)
	return err
}

func (r *shiftRepositoryImpl) GetUserShift(ctx context.Context, username string) (*model.Shift, error) {
	var shift model.Shift
	// Priority 1: User's assigned shift
	queryUserShift := `
		SELECT s.* 
		FROM users u 
		LEFT JOIN shifts s ON u.shift_id = s.id 
		WHERE u.username = ?`

	err := r.db.GetContext(ctx, &shift, queryUserShift, username)
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
