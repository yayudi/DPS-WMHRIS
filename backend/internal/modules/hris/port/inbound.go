package port

import (
	"context"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	"github.com/xuri/excelize/v2"
)

// AttendanceUseCase defines the inbound port for attendance operations
type AttendanceUseCase interface {
	GetIndexes(ctx context.Context) (map[int][]int, error)
	GetHistory(ctx context.Context, startDate string, endDate string, search string) ([]map[string]interface{}, error)
	GetRangeData(ctx context.Context, startDate, endDate string) (*hris_dto.AttendanceRangeResponse, error)
	GetMonthlyData(ctx context.Context, year, month int) (*hris_dto.AttendanceRangeResponse, error)
	UpdateLog(ctx context.Context, req hris_dto.UpdateLogRequest) error
	ProcessImport(ctx context.Context, jobID int, filePath string, isDryRun bool) (string, error)
}

// ScheduleUseCase defines the inbound port for schedule operations
type ScheduleUseCase interface {
	GetSchedules(ctx context.Context, userIDStr string, startDate string, endDate string) ([]hris_dto.ScheduleResponse, error)
	CreateSchedule(ctx context.Context, req hris_dto.CreateScheduleRequest, createdBy *int) error
	DeleteSchedule(ctx context.Context, userIDStr string, date string) error
	GenerateTemplate(ctx context.Context) (*excelize.File, error)
	ProcessImport(ctx context.Context, jobID int, filePath string, createdBy int) (string, error)
}

// ShiftUseCase defines the inbound port for shift operations
type ShiftUseCase interface {
	GetAll(ctx context.Context) ([]domain.Shift, error)
	GetByID(ctx context.Context, id int) (*domain.Shift, error)
	Create(ctx context.Context, req hris_dto.CreateShiftRequest) (int, error)
	Update(ctx context.Context, id int, req hris_dto.UpdateShiftRequest) error
	Delete(ctx context.Context, id int) error
}
