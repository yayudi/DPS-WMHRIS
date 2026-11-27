package usecase

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	hris_parser "github.com/dps-wmhris/backend/internal/modules/hris/application/parser"
	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	iam_port "github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

type scheduleUseCaseImpl struct {
	txManager    database.TransactionManager
	scheduleRepo hris_port.ScheduleRepository
	shiftRepo    hris_port.ShiftRepository
	userRepo     iam_port.UserRepository
}

// NewScheduleUseCase creates a ScheduleUseCase wired with transaction management and outbound ports.
func NewScheduleUseCase(
	txManager database.TransactionManager,
	scheduleRepo hris_port.ScheduleRepository,
	shiftRepo hris_port.ShiftRepository,
	userRepo iam_port.UserRepository,
) hris_port.ScheduleUseCase {
	return &scheduleUseCaseImpl{
		txManager:    txManager,
		scheduleRepo: scheduleRepo,
		shiftRepo:    shiftRepo,
		userRepo:     userRepo,
	}
}

func parsePositiveUserID(userIDStr string) (int, error) {
	userID, err := strconv.Atoi(strings.TrimSpace(userIDStr))
	if err != nil || userID <= 0 {
		return 0, apperror.Validation("hris.schedule.err_invalid_user_id", "user_id tidak valid")
	}
	return userID, nil
}

func (s *scheduleUseCaseImpl) GetSchedules(ctx context.Context, userIDStr string, startDate string, endDate string) ([]hris_dto.ScheduleResponse, error) {
	userID, err := parsePositiveUserID(userIDStr)
	if err != nil {
		return nil, err
	}
	if _, _, err := parseDateRange(startDate, endDate, 0); err != nil {
		return nil, err
	}

	schedules, err := s.scheduleRepo.GetByRange(ctx, userID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	if schedules == nil {
		return []hris_dto.ScheduleResponse{}, nil
	}
	return schedules, nil
}

func (s *scheduleUseCaseImpl) CreateSchedule(ctx context.Context, req hris_dto.CreateScheduleRequest, createdBy *int) error {
	if req.UserID <= 0 || req.ShiftID <= 0 {
		return apperror.Validation("hris.schedule.err_invalid_payload", "userId dan shiftId wajib bernilai positif")
	}
	dateStr := strings.TrimSpace(req.Date)
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		return domain.ErrInvalidDateRange
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		return s.scheduleRepo.Upsert(txCtx, req.UserID, req.ShiftID, dateStr, createdBy)
	})
}

func (s *scheduleUseCaseImpl) DeleteSchedule(ctx context.Context, userIDStr string, date string) error {
	userID, err := parsePositiveUserID(userIDStr)
	if err != nil {
		return err
	}
	dateStr := strings.TrimSpace(date)
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		return domain.ErrInvalidDateRange
	}

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		return s.scheduleRepo.Delete(txCtx, userID, dateStr)
	})
}

func (s *scheduleUseCaseImpl) GenerateTemplate(ctx context.Context) (*excelize.File, error) {
	users, err := s.userRepo.GetAll(ctx)
	if err != nil {
		return nil, apperror.Internal("hris.schedule.err_fetch_users_failed", "Gagal memuat data user", err)
	}
	shifts, err := s.shiftRepo.GetAll(ctx)
	if err != nil {
		return nil, apperror.Internal("hris.schedule.err_fetch_shifts_failed", "Gagal memuat data shift", err)
	}

	f := excelize.NewFile()
	success := false
	defer func() {
		if !success {
			_ = f.Close()
		}
	}()

	mainSheet := "Import Schedule"
	dataSheet := "DataList"

	if err := f.SetSheetName("Sheet1", mainSheet); err != nil {
		return nil, apperror.Internal("hris.schedule.err_template_build", "Gagal membangun template jadwal", err)
	}
	if _, err := f.NewSheet(dataSheet); err != nil {
		return nil, apperror.Internal("hris.schedule.err_template_build", "Gagal membangun sheet referensi jadwal", err)
	}
	_ = f.SetSheetVisible(dataSheet, false)

	for i, u := range users {
		cell, _ := excelize.CoordinatesToCellName(1, i+1)
		_ = f.SetCellValue(dataSheet, cell, u.Username)
	}
	for i, sh := range shifts {
		cell, _ := excelize.CoordinatesToCellName(2, i+1)
		_ = f.SetCellValue(dataSheet, cell, sh.Name)
	}

	styles := utils.InitExcelStyles(f)
	utils.SetHeaders(f, mainSheet, []string{"Username", "Date (YYYY-MM-DD)", "Shift Name"}, styles.Header)
	utils.SetColWidths(f, mainSheet, map[string]float64{"A": 25, "B": 20, "C": 25})

	_ = f.SetSheetRow(mainSheet, "A2", &[]any{"user_demo", "2026-01-31", "Regular Pagi"})
	italicStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Italic: true, Color: "#888888"},
	})
	_ = f.SetCellStyle(mainSheet, "A2", "C2", italicStyle)

	dvUsername := excelize.NewDataValidation(true)
	dvUsername.Sqref = "A2:A1000"
	dvUsername.SetSqrefDropList("DataList!$A$1:$A$1000")
	if err := f.AddDataValidation(mainSheet, dvUsername); err != nil {
		return nil, apperror.Internal("hris.schedule.err_template_validation", "Gagal menambahkan dropdown username", err)
	}

	dvShift := excelize.NewDataValidation(true)
	dvShift.Sqref = "C2:C1000"
	dvShift.SetSqrefDropList("DataList!$B$1:$B$1000")
	if err := f.AddDataValidation(mainSheet, dvShift); err != nil {
		return nil, apperror.Internal("hris.schedule.err_template_validation", "Gagal menambahkan dropdown shift", err)
	}

	success = true
	return f, nil
}

func (s *scheduleUseCaseImpl) ProcessImport(ctx context.Context, jobID int, filePath string, createdBy int) (string, error) {
	filePath = utils.ResolveStoragePath(filePath)
	schedules, errorsList, err := hris_parser.ParseScheduleExcel(filePath)
	if err != nil {
		return "", err
	}

	if len(errorsList) > 0 {
		return "", apperror.Validation("hris.schedule.err_validation_failed", fmt.Sprintf("Ditemukan %d error validasi: %s", len(errorsList), strings.Join(errorsList, " | ")), map[string]any{"count": len(errorsList)})
	}

	if len(schedules) == 0 {
		return "", apperror.Validation("hris.schedule.err_no_valid_data", "Tidak ada data valid di dalam file")
	}

	users, err := s.userRepo.GetAll(ctx)
	if err != nil {
		return "", apperror.Internal("hris.schedule.err_fetch_users_failed", "Gagal memuat data user", err)
	}
	userMap := make(map[string]int, len(users))
	for _, u := range users {
		userMap[strings.ToLower(strings.TrimSpace(u.Username))] = u.ID
	}

	shifts, err := s.shiftRepo.GetAll(ctx)
	if err != nil {
		return "", apperror.Internal("hris.schedule.err_fetch_shifts_failed", "Gagal memuat data shift", err)
	}
	shiftMap := make(map[string]int, len(shifts))
	for _, sh := range shifts {
		shiftMap[strings.ToLower(strings.TrimSpace(sh.Name))] = sh.ID
	}

	type resolvedSchedule struct {
		userID    int
		shiftID   int
		date      string
		rowNumber int
	}

	var finalErrors []string
	validSchedules := make([]resolvedSchedule, 0, len(schedules))

	for _, sc := range schedules {
		userID, ok := userMap[strings.ToLower(strings.TrimSpace(sc.Username))]
		if !ok {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: User '%s' tidak ditemukan.", sc.RowNumber, sc.Username))
			continue
		}
		shiftID, ok := shiftMap[strings.ToLower(strings.TrimSpace(sc.ShiftName))]
		if !ok {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: Shift '%s' tidak ditemukan.", sc.RowNumber, sc.ShiftName))
			continue
		}

		validSchedules = append(validSchedules, resolvedSchedule{
			userID:    userID,
			shiftID:   shiftID,
			date:      sc.Date,
			rowNumber: sc.RowNumber,
		})
	}

	if len(finalErrors) > 0 {
		return "", apperror.Validation("hris.schedule.err_validation_failed", fmt.Sprintf("Ditemukan %d error validasi: %s", len(finalErrors), strings.Join(finalErrors, " | ")), map[string]any{"count": len(finalErrors)})
	}

	successCount := 0
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		for _, sc := range validSchedules {
			if err := s.scheduleRepo.Upsert(txCtx, sc.userID, sc.shiftID, sc.date, &createdBy); err != nil {
				return apperror.Internal(
					"hris.schedule.err_save_row_failed",
					fmt.Sprintf("Gagal menyimpan data baris %d: %v", sc.rowNumber, err),
					err,
					map[string]any{"row": sc.rowNumber},
				)
			}
			successCount++
		}
		return nil
	}); err != nil {
		return "", err
	}

	summary := i18n.T(ctx, "hris.schedule.import_summary", map[string]any{
		"count": successCount,
	})
	if summary == "hris.schedule.import_summary" {
		summary = fmt.Sprintf("Berhasil mengimpor jadwal untuk %d baris", successCount)
	}
	return summary, nil
}
