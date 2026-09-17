package usecase

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"

	hris_parser "github.com/dps-wmhris/backend/internal/modules/hris/application/parser"

	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	iam_port "github.com/dps-wmhris/backend/internal/modules/iam/port"

	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/xuri/excelize/v2"
)

type scheduleUseCaseImpl struct {
	scheduleRepo hris_port.ScheduleRepository
	shiftRepo    hris_port.ShiftRepository
	userRepo     iam_port.UserRepository // Assuming we have UserRepository available (we need to inject it)
}

func NewScheduleUseCase(scheduleRepo hris_port.ScheduleRepository, shiftRepo hris_port.ShiftRepository, userRepo iam_port.UserRepository) hris_port.ScheduleUseCase {
	return &scheduleUseCaseImpl{
		scheduleRepo: scheduleRepo,
		shiftRepo:    shiftRepo,
		userRepo:     userRepo,
	}
}

func (s *scheduleUseCaseImpl) GetSchedules(ctx context.Context, userIDStr string, startDate string, endDate string) ([]hris_dto.ScheduleResponse, error) {
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return nil, err
	}
	// Verify date formats if needed
	_, err = time.Parse("2006-01-02", startDate)
	if err != nil {
		return nil, err
	}
	_, err = time.Parse("2006-01-02", endDate)
	if err != nil {
		return nil, err
	}

	return s.scheduleRepo.GetByRange(ctx, userID, startDate, endDate)
}

func (s *scheduleUseCaseImpl) CreateSchedule(ctx context.Context, req hris_dto.CreateScheduleRequest, createdBy *int) error {
	return s.scheduleRepo.Upsert(ctx, req.UserID, req.ShiftID, req.Date, createdBy)
}

func (s *scheduleUseCaseImpl) DeleteSchedule(ctx context.Context, userIDStr string, date string) error {
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return err
	}
	return s.scheduleRepo.Delete(ctx, userID, date)
}

func (s *scheduleUseCaseImpl) GenerateTemplate(ctx context.Context) (*excelize.File, error) {
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			// just log ideally
		}
	}()

	mainSheet := "Import Schedule"
	dataSheet := "DataList"

	// Rename default sheet
	_ = f.SetSheetName("Sheet1", mainSheet) // #nosec G104

	// Create DataList sheet for dropdowns
	_, _ = f.NewSheet(dataSheet)            // #nosec G104
	_ = f.SetSheetVisible(dataSheet, false) // Hide data sheet // #nosec G104

	users, _ := s.userRepo.GetAll(ctx) // Assuming GetAll exists
	shifts, _ := s.shiftRepo.GetAll(ctx)

	// Fill DataList
	for i, u := range users {
		cell, _ := excelize.CoordinatesToCellName(1, i+1) // A1, A2, ...
		_ = f.SetCellValue(dataSheet, cell, u.Username)   // #nosec G104
	}
	for i, sh := range shifts {
		cell, _ := excelize.CoordinatesToCellName(2, i+1) // B1, B2, ...
		_ = f.SetCellValue(dataSheet, cell, sh.Name)      // #nosec G104
	}

	// Style header
	styles := utils.InitExcelStyles(f)

	// Main sheet headers
	utils.SetHeaders(f, mainSheet, []string{"Username", "Date (YYYY-MM-DD)", "Shift Name"}, styles.Header)
	utils.SetColWidths(f, mainSheet, map[string]float64{"A": 25, "B": 20, "C": 25})

	// Example Row
	_ = f.SetSheetRow(mainSheet, "A2", &[]interface{}{"user_demo", "2026-01-31", "Regular Pagi"}) // #nosec G104
	italicStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Italic: true, Color: "#888888"},
	})
	_ = f.SetCellStyle(mainSheet, "A2", "C2", italicStyle) // #nosec G104

	// Add data validation for 1000 rows
	dvUsername := excelize.NewDataValidation(true)
	dvUsername.Sqref = "A2:A1000"
	_ = dvUsername.SetDropList([]string{}) // #nosec G104
	dvUsername.SetSqrefDropList("DataList!$A$1:$A$1000")
	return f, nil
}

func (s *scheduleUseCaseImpl) ProcessImport(ctx context.Context, jobID int, filePath string, createdBy int) (string, error) {
	// Parse Excel
	schedules, errorsList, err := hris_parser.ParseScheduleExcel(filePath)
	if err != nil {
		return "", err
	}

	if len(errorsList) > 0 {
		return "", fmt.Errorf("Ditemukan %d error validasi: %s", len(errorsList), strings.Join(errorsList, " | "))
	}

	if len(schedules) == 0 {
		return "", fmt.Errorf("Tidak ada data valid di dalam file")
	}

	// Fetch users and shifts to build maps
	users, err := s.userRepo.GetAll(ctx)
	if err != nil {
		return "", fmt.Errorf("Gagal memuat data user: %v", err)
	}
	userMap := make(map[string]int)
	for _, u := range users {
		userMap[strings.ToLower(u.Username)] = u.ID
	}

	shifts, err := s.shiftRepo.GetAll(ctx)
	if err != nil {
		return "", fmt.Errorf("Gagal memuat data shift: %v", err)
	}
	shiftMap := make(map[string]int)
	for _, sh := range shifts {
		shiftMap[strings.ToLower(sh.Name)] = sh.ID
	}

	// Validate against database
	var finalErrors []string
	var validSchedules []hris_parser.ScheduleRow

	for _, sc := range schedules {
		_, ok := userMap[strings.ToLower(sc.Username)]
		if !ok {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: User '%s' tidak ditemukan.", sc.RowNumber, sc.Username))
			continue
		}
		_, ok = shiftMap[strings.ToLower(sc.ShiftName)]
		if !ok {
			finalErrors = append(finalErrors, fmt.Sprintf("Baris %d: Shift '%s' tidak ditemukan.", sc.RowNumber, sc.ShiftName))
			continue
		}

		validSchedules = append(validSchedules, hris_parser.ScheduleRow{
			Username:  sc.Username,
			Date:      sc.Date,
			ShiftName: sc.ShiftName,
			RowNumber: sc.RowNumber,
		})
	}

	if len(finalErrors) > 0 {
		return "", fmt.Errorf("Ditemukan %d error validasi: %s", len(finalErrors), strings.Join(finalErrors, " | "))
	}

	// Process Upsert
	successCount := 0
	for _, sc := range schedules {
		userID := userMap[strings.ToLower(sc.Username)]
		shiftID := shiftMap[strings.ToLower(sc.ShiftName)]

		err := s.scheduleRepo.Upsert(ctx, userID, shiftID, sc.Date, &createdBy)
		if err != nil {
			return "", fmt.Errorf("Gagal menyimpan data baris %d: %v", sc.RowNumber, err)
		}
		successCount++
	}

	return fmt.Sprintf("Berhasil mengimpor jadwal untuk %d baris", successCount), nil
}
