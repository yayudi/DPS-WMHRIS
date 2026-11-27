package mysql

import (
	"context"
	"database/sql"
	"errors"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type scheduleRepositoryImpl struct {
	db *sqlx.DB
}

// NewScheduleRepository creates a MySQL-backed ScheduleRepository.
func NewScheduleRepository(db *sqlx.DB) port.ScheduleRepository {
	return &scheduleRepositoryImpl{db: db}
}

func (r *scheduleRepositoryImpl) GetByRange(ctx context.Context, userID int, startDate string, endDate string) ([]hris_dto.ScheduleResponse, error) {
	ext := database.GetExt(ctx, r.db)
	schedules := make([]hris_dto.ScheduleResponse, 0)
	query := `
		SELECT
			us.id, us.user_id, us.shift_id, us.date,
			s.name AS shift_name, s.start_time, s.end_time,
			COALESCE(s.flexible_minutes, 0) AS flexible_minutes
		FROM user_schedules us
		JOIN shifts s ON us.shift_id = s.id
		WHERE us.user_id = ? AND us.date BETWEEN ? AND ?
		ORDER BY us.date ASC
	`
	if err := ext.SelectContext(ctx, &schedules, query, userID, startDate, endDate); err != nil {
		return nil, err
	}
	if schedules == nil {
		return []hris_dto.ScheduleResponse{}, nil
	}
	return schedules, nil
}

func (r *scheduleRepositoryImpl) GetByDate(ctx context.Context, userID int, date string) (*hris_dto.ScheduleResponse, error) {
	ext := database.GetExt(ctx, r.db)
	var schedule hris_dto.ScheduleResponse
	query := `
		SELECT
			us.id, us.user_id, us.shift_id, us.date,
			s.name AS shift_name, s.start_time, s.end_time,
			COALESCE(s.flexible_minutes, 0) AS flexible_minutes
		FROM user_schedules us
		JOIN shifts s ON us.shift_id = s.id
		WHERE us.user_id = ? AND us.date = ?
	`
	if err := ext.GetContext(ctx, &schedule, query, userID, date); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &schedule, nil
}

func (r *scheduleRepositoryImpl) Upsert(ctx context.Context, userID int, shiftID int, date string, createdBy *int) error {
	ext := database.GetExt(ctx, r.db)
	query := `
		INSERT INTO user_schedules (user_id, shift_id, date, created_by)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), created_by = VALUES(created_by)
	`
	_, err := ext.ExecContext(ctx, query, userID, shiftID, date, createdBy)
	return err
}

func (r *scheduleRepositoryImpl) Delete(ctx context.Context, userID int, date string) error {
	ext := database.GetExt(ctx, r.db)
	query := `DELETE FROM user_schedules WHERE user_id = ? AND date = ?`
	_, err := ext.ExecContext(ctx, query, userID, date)
	return err
}
