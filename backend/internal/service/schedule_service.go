package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/parser"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/utils"
	"github.com/xuri/excelize/v2"
)

type ScheduleService interface {
	GetSchedules(ctx context.Context, userIDStr string, startDate string, endDate string) ([]dto.ScheduleResponse, error)
	CreateSchedule(ctx context.Context, req dto.CreateScheduleRequest, createdBy *int) error
	DeleteSchedule(ctx context.Context, userIDStr string, date string) error
	GenerateTemplate(ctx context.Context) (*excelize.File, error)
	ProcessImport(ctx context.Context, jobID int, filePath string, createdBy int) (string, error)
}

type scheduleServiceImpl struct {
	scheduleRepo repository.ScheduleRepository
	shiftRepo    repository.ShiftRepository
	userRepo     repository.UserRepository // Assuming we have UserRepository available (we need to inject it)
}

func NewScheduleService(scheduleRepo repository.ScheduleRepository, shiftRepo repository.ShiftRepository, userRepo repository.UserRepository) ScheduleService {
	return &scheduleServiceImpl{
		scheduleRepo: scheduleRepo,
		shiftRepo:    shiftRepo,
		userRepo:     userRepo,
	}
}

func (s *scheduleServiceImpl) GetSchedules(ctx context.Context, userIDStr string, startDate string, endDate string) ([]dto.ScheduleResponse, error) {
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

func (s *scheduleServiceImpl) CreateSchedule(ctx context.Context, req dto.CreateScheduleRequest, createdBy *int) error {
	return s.scheduleRepo.Upsert(ctx, req.UserID, req.ShiftID, req.Date, createdBy)
}

func (s *scheduleServiceImpl) DeleteSchedule(ctx context.Context, userIDStr string, date string) error {
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return err
	}
	return s.scheduleRepo.Delete(ctx, userID, date)
}

func (s *scheduleServiceImpl) GenerateTemplate(ctx context.Context) (*excelize.File, error) {
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			// just log ideally
		}
	}()

	mainSheet := "Import Schedule"
	dataSheet := "DataList"

	// Rename default sheet
	f.SetSheetName("Sheet1", mainSheet)
	
	// Create DataList sheet for dropdowns
	f.NewSheet(dataSheet)
	f.SetSheetVisible(dataSheet, false) // Hide data sheet

	users, _ := s.userRepo.GetAll(ctx) // Assuming GetAll exists
	shifts, _ := s.shiftRepo.GetAll(ctx)

	// Fill DataList
	for i, u := range users {
		cell, _ := excelize.CoordinatesToCellName(1, i+1) // A1, A2, ...
		f.SetCellValue(dataSheet, cell, u.Username)
	}
	for i, sh := range shifts {
		cell, _ := excelize.CoordinatesToCellName(2, i+1) // B1, B2, ...
		f.SetCellValue(dataSheet, cell, sh.Name)
	}

	// Style header
	styles := utils.InitExcelStyles(f)

	// Main sheet headers
	utils.SetHeaders(f, mainSheet, []string{"Username", "Date (YYYY-MM-DD)", "Shift Name"}, styles.Header)
	utils.SetColWidths(f, mainSheet, map[string]float64{"A": 25, "B": 20, "C": 25})

	// Example Row
	f.SetSheetRow(mainSheet, "A2", &[]interface{}{"user_demo", "2026-01-31", "Regular Pagi"})
	italicStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Italic: true, Color: "#888888"},
	})
	f.SetCellStyle(mainSheet, "A2", "C2", italicStyle)

	// Add data validation for 1000 rows
	dvUsername := excelize.NewDataValidation(true)
	dvUsername.Sqref = "A2:A1000"
	dvUsername.SetDropList([]string{})
	dvUsername.SetSqrefDropList("DataList!$A$1:$A$1000")	
	return f, nil
}

func (s *scheduleServiceImpl) ProcessImport(ctx context.Context, jobID int, filePath string, createdBy int) (string, error) {
	// Parse Excel
	schedules, errorsList, err := parser.ParseScheduleExcel(filePath)
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
	var validSchedules []parser.ScheduleRow

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

		validSchedules = append(validSchedules, parser.ScheduleRow{
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
