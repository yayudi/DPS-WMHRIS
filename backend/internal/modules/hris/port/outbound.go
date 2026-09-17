package port

import (
	"context"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
)

// AttendanceRepository defines the outbound port for attendance data operations
type AttendanceRepository interface {
	GetIndexes(ctx context.Context) (map[int][]int, error)
	GetHistory(ctx context.Context, startDate string, endDate string, search string) ([]map[string]interface{}, error)
	GetRangeLogs(ctx context.Context, startDate string, endDate string) ([]map[string]interface{}, error)
	GetMonthlyLogs(ctx context.Context, year int, month int) ([]map[string]interface{}, error)
	GetHolidays(ctx context.Context, year int) (map[string]bool, error)
	GetLogByUsernameAndDate(ctx context.Context, username, date string) (*domain.AttendanceLog, error)
	UpsertLog(ctx context.Context, log *domain.AttendanceLog) error
}

// ScheduleRepository defines the outbound port for schedule data operations
type ScheduleRepository interface {
	GetByRange(ctx context.Context, userID int, startDate string, endDate string) ([]hris_dto.ScheduleResponse, error)
	GetByDate(ctx context.Context, userID int, date string) (*hris_dto.ScheduleResponse, error)
	Upsert(ctx context.Context, userID int, shiftID int, date string, createdBy *int) error
	Delete(ctx context.Context, userID int, date string) error
}

// ShiftRepository defines the outbound port for shift data operations
type ShiftRepository interface {
	GetAll(ctx context.Context) ([]domain.Shift, error)
	GetByID(ctx context.Context, id int) (*domain.Shift, error)
	Create(ctx context.Context, shift *domain.Shift) (int, error)
	Update(ctx context.Context, shift *domain.Shift) error
	Delete(ctx context.Context, id int) error
	ClearDefault(ctx context.Context) error
	GetUserShift(ctx context.Context, username string) (*domain.Shift, error)
}
