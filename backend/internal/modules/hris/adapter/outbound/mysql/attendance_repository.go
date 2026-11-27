// Package mysql implements MySQL persistence repositories for the HRIS module.
package mysql

import (
	"context"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	"github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type attendanceRepositoryImpl struct {
	db *sqlx.DB
}

// NewAttendanceRepository creates a MySQL-backed AttendanceRepository.
func NewAttendanceRepository(db *sqlx.DB) port.AttendanceRepository {
	return &attendanceRepositoryImpl{db: db}
}

func scanMapRows(rows *sqlx.Rows) ([]map[string]any, error) {
	results := make([]map[string]any, 0)
	for rows.Next() {
		row := make(map[string]any)
		if err := rows.MapScan(row); err != nil {
			return nil, err
		}
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return results, nil
}

func (r *attendanceRepositoryImpl) GetIndexes(ctx context.Context) (map[int][]int, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT DISTINCT YEAR(date) AS year, MONTH(date) AS month
		FROM attendance_logs
		ORDER BY year DESC, month DESC
	`
	rows, err := ext.QueryxContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	indexes := make(map[int][]int)
	for rows.Next() {
		var year, month int
		if err := rows.Scan(&year, &month); err != nil {
			return nil, err
		}
		indexes[year] = append(indexes[year], month)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return indexes, nil
}

func (r *attendanceRepositoryImpl) GetHistory(ctx context.Context, startDate string, endDate string, search string) ([]map[string]any, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			al.id, al.username, u.nickname, al.date, al.check_in, al.check_out,
			COALESCE(al.lateness_minutes, 0) AS lateness_minutes,
			COALESCE(al.overtime_minutes, 0) AS overtime_minutes,
			COALESCE(al.late_pardon_minutes, 0) AS late_pardon_minutes,
			al.notes, al.status
		FROM attendance_logs al
		LEFT JOIN users u ON al.username = u.username
		WHERE al.date BETWEEN ? AND ?
	`
	params := []any{startDate, endDate}

	if search != "" {
		query += ` AND (al.username LIKE ? OR u.nickname LIKE ?)`
		likeSearch := "%" + search + "%"
		params = append(params, likeSearch, likeSearch)
	}

	query += ` ORDER BY al.date DESC, al.check_in ASC`

	rows, err := ext.QueryxContext(ctx, query, params...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMapRows(rows)
}

func (r *attendanceRepositoryImpl) GetRangeLogs(ctx context.Context, startDate string, endDate string) ([]map[string]any, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			al.id, al.username, u.id AS user_id, al.date, al.check_in, al.check_out,
			COALESCE(al.lateness_minutes, 0) AS lateness_minutes,
			COALESCE(al.overtime_minutes, 0) AS overtime_minutes,
			COALESCE(al.late_pardon_minutes, 0) AS late_pardon_minutes,
			al.notes, al.status,
			arl.log_time, arl.log_type
		FROM attendance_logs al
		JOIN users u ON al.username = u.username
		LEFT JOIN attendance_raw_logs arl ON al.id = arl.attendance_log_id
		WHERE al.date BETWEEN ? AND ?
		  AND u.exclude_from_attendance = FALSE
		ORDER BY al.username, al.date, arl.log_time
	`
	rows, err := ext.QueryxContext(ctx, query, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMapRows(rows)
}

func (r *attendanceRepositoryImpl) GetMonthlyLogs(ctx context.Context, year int, month int) ([]map[string]any, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			al.id, al.username, u.id AS user_id, al.date, al.check_in, al.check_out,
			COALESCE(al.lateness_minutes, 0) AS lateness_minutes,
			COALESCE(al.overtime_minutes, 0) AS overtime_minutes,
			COALESCE(al.late_pardon_minutes, 0) AS late_pardon_minutes,
			al.notes, al.status,
			arl.log_time, arl.log_type
		FROM attendance_logs al
		JOIN users u ON al.username = u.username
		LEFT JOIN attendance_raw_logs arl ON al.id = arl.attendance_log_id
		WHERE YEAR(al.date) = ? AND MONTH(al.date) = ?
		  AND u.exclude_from_attendance = FALSE
		ORDER BY al.username, al.date, arl.log_time
	`
	rows, err := ext.QueryxContext(ctx, query, year, month)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMapRows(rows)
}

func (r *attendanceRepositoryImpl) GetHolidays(ctx context.Context, year int) (map[string]bool, error) {
	ext := database.GetExt(ctx, r.db)
	query := "SELECT date, name FROM holidays WHERE YEAR(date) = ?"
	rows, err := ext.QueryxContext(ctx, query, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	holidayMap := make(map[string]bool)
	for rows.Next() {
		var h domain.Holiday
		if err := rows.StructScan(&h); err != nil {
			return nil, err
		}
		holidayMap[h.Date.Format("2006-01-02")] = true
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return holidayMap, nil
}

func (r *attendanceRepositoryImpl) GetLogByUsernameAndDate(ctx context.Context, username, date string) (*domain.AttendanceLog, error) {
	ext := database.GetExt(ctx, r.db)
	query := `
		SELECT
			id, username, date, check_in, check_out,
			COALESCE(lateness_minutes, 0) AS lateness_minutes,
			COALESCE(overtime_minutes, 0) AS overtime_minutes,
			COALESCE(late_pardon_minutes, 0) AS late_pardon_minutes,
			status, notes
		FROM attendance_logs
		WHERE username = ? AND date = ?
	`
	var logEntry domain.AttendanceLog
	if err := ext.GetContext(ctx, &logEntry, query, username, date); err != nil {
		return nil, err
	}
	return &logEntry, nil
}

func (r *attendanceRepositoryImpl) UpsertLog(ctx context.Context, log *domain.AttendanceLog) error {
	ext := database.GetExt(ctx, r.db)

	insertPardon := log.LatePardonMinutes
	if insertPardon < 0 {
		insertPardon = 0
	}

	query := `
		INSERT INTO attendance_logs (
			username, date, check_in, check_out,
			lateness_minutes, overtime_minutes, late_pardon_minutes, status, notes
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			check_in = VALUES(check_in),
			check_out = VALUES(check_out),
			lateness_minutes = VALUES(lateness_minutes),
			overtime_minutes = VALUES(overtime_minutes),
			late_pardon_minutes = IF(? < 0, late_pardon_minutes, VALUES(late_pardon_minutes)),
			status = VALUES(status),
			notes = VALUES(notes)
	`
	_, err := ext.ExecContext(
		ctx, query,
		log.Username, log.Date, log.CheckIn, log.CheckOut,
		log.LatenessMinutes, log.OvertimeMinutes, insertPardon, log.Status, log.Notes,
		log.LatePardonMinutes,
	)
	return err
}
