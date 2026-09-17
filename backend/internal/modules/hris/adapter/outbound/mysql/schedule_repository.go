package mysql

import (
	"context"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/hris/port"

	"github.com/jmoiron/sqlx"
)

type scheduleRepositoryImpl struct {
	db *sqlx.DB
}

func NewScheduleRepository(db *sqlx.DB) port.ScheduleRepository {
	return &scheduleRepositoryImpl{db: db}
}

func (r *scheduleRepositoryImpl) GetByRange(ctx context.Context, userID int, startDate string, endDate string) ([]hris_dto.ScheduleResponse, error) {
	var schedules []hris_dto.ScheduleResponse
	query := `
		SELECT us.id, us.user_id, us.shift_id, us.date, 
		       s.name as shift_name, s.start_time, s.end_time, s.flexible_minutes
		FROM user_schedules us
		JOIN shifts s ON us.shift_id = s.id
		WHERE us.user_id = ? AND us.date BETWEEN ? AND ?
		ORDER BY us.date ASC
	`
	err := r.db.SelectContext(ctx, &schedules, query, userID, startDate, endDate)
	return schedules, err
}

func (r *scheduleRepositoryImpl) GetByDate(ctx context.Context, userID int, date string) (*hris_dto.ScheduleResponse, error) {
	var schedule hris_dto.ScheduleResponse
	query := `
		SELECT us.id, us.user_id, us.shift_id, us.date, 
		       s.name as shift_name, s.start_time, s.end_time, s.flexible_minutes
		FROM user_schedules us
		JOIN shifts s ON us.shift_id = s.id
		WHERE us.user_id = ? AND us.date = ?
	`
	err := r.db.GetContext(ctx, &schedule, query, userID, date)
	if err != nil {
		return nil, err
	}
	return &schedule, nil
}

func (r *scheduleRepositoryImpl) Upsert(ctx context.Context, userID int, shiftID int, date string, createdBy *int) error {
	query := `
		INSERT INTO user_schedules (user_id, shift_id, date, created_by)
		VALUES (?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE shift_id = VALUES(shift_id), created_by = VALUES(created_by)
	`
	_, err := r.db.ExecContext(ctx, query, userID, shiftID, date, createdBy)
	return err
}

func (r *scheduleRepositoryImpl) Delete(ctx context.Context, userID int, date string) error {
	query := `DELETE FROM user_schedules WHERE user_id = ? AND date = ?`
	_, err := r.db.ExecContext(ctx, query, userID, date)
	return err
}
