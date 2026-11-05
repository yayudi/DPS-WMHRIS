package hris_parser_test

import (
	"path/filepath"
	"testing"

	hris_parser "github.com/dps-wmhris/backend/internal/modules/hris/application/parser"
	"github.com/xuri/excelize/v2"
)

func TestParseScheduleExcel(t *testing.T) {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "schedule_test.xlsx")

	f := excelize.NewFile()
	sheet := "Schedule"
	_ = f.SetSheetName("Sheet1", sheet)

	// Row 1: Header
	_ = f.SetCellValue(sheet, "A1", "Username")
	_ = f.SetCellValue(sheet, "B1", "Date (YYYY-MM-DD)")
	_ = f.SetCellValue(sheet, "C1", "Shift Name")

	// Row 2: Example row (must be skipped)
	_ = f.SetCellValue(sheet, "A2", "user_demo")
	_ = f.SetCellValue(sheet, "B2", "2026-01-31")
	_ = f.SetCellValue(sheet, "C2", "Regular Pagi")

	// Row 3: Valid data
	_ = f.SetCellValue(sheet, "A3", "john_doe")
	_ = f.SetCellValue(sheet, "B3", "2026-02-01")
	_ = f.SetCellValue(sheet, "C3", "Shift Pagi")

	// Row 4: Valid data
	_ = f.SetCellValue(sheet, "A4", "jane_doe")
	_ = f.SetCellValue(sheet, "B4", "2026-02-02")
	_ = f.SetCellValue(sheet, "C4", "Shift Malam")

	// Row 5: Invalid Date
	_ = f.SetCellValue(sheet, "A5", "bob_wilson")
	_ = f.SetCellValue(sheet, "B5", "31-02-2026")
	_ = f.SetCellValue(sheet, "C5", "Shift Siang")

	if err := f.SaveAs(filePath); err != nil {
		t.Fatalf("failed to save test excel: %v", err)
	}
	defer f.Close()

	schedules, errorsList, err := hris_parser.ParseScheduleExcel(filePath)
	if err != nil {
		t.Fatalf("unexpected error parsing schedule excel: %v", err)
	}

	if len(schedules) != 2 {
		t.Fatalf("expected 2 valid schedules, got %d", len(schedules))
	}
	if len(errorsList) != 1 {
		t.Fatalf("expected 1 error for invalid date, got %d: %v", len(errorsList), errorsList)
	}

	if schedules[0].Username != "john_doe" || schedules[0].Date != "2026-02-01" || schedules[0].ShiftName != "Shift Pagi" {
		t.Errorf("unexpected schedule 0: %+v", schedules[0])
	}
	if schedules[1].Username != "jane_doe" || schedules[1].Date != "2026-02-02" || schedules[1].ShiftName != "Shift Malam" {
		t.Errorf("unexpected schedule 1: %+v", schedules[1])
	}
}

