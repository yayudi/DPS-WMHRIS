package hris_parser

import (
	"fmt"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/parser"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

// ScheduleRow represents a single validated shift schedule entry extracted from an Excel import file.
type ScheduleRow struct {
	Username  string
	Date      string
	ShiftName string
	RowNumber int
}

// ParseScheduleExcel reads and validates shift schedule rows from an uploaded Excel workbook.
// Row 1 is treated as the header and row 2 as the template example row (skipped).
func ParseScheduleExcel(filepath string) ([]ScheduleRow, []string, error) {
	records, err := parser.ReadExcelFile(filepath)
	if err != nil {
		return nil, nil, apperror.Validation("hris.schedule.err_excel_invalid", "file Excel tidak valid atau rusak", map[string]any{"error": err.Error()})
	}

	if len(records) == 0 {
		return nil, nil, apperror.Validation("hris.schedule.err_excel_empty", "file Excel kosong")
	}

	var schedules []ScheduleRow
	var errs []string

	for i, record := range records {
		rowNum := i + 2 // i=0 corresponds to row 2 in Excel (example row in template)
		if rowNum <= 2 {
			continue
		}

		username := strings.TrimSpace(parser.GetField(record, "Username", "username", "User", "user"))
		dateStr := strings.TrimSpace(parser.GetField(record, "Date (YYYY-MM-DD)", "Date", "date", "Tanggal", "tanggal"))
		shiftName := strings.TrimSpace(parser.GetField(record, "Shift Name", "Shift", "shift", "Nama Shift", "nama_shift"))

		if username == "" && dateStr == "" && shiftName == "" {
			continue // Skip completely empty rows
		}

		if username == "" {
			errs = append(errs, fmt.Sprintf("Baris %d: Username wajib diisi.", rowNum))
			continue
		}
		if dateStr == "" {
			errs = append(errs, fmt.Sprintf("Baris %d: Format Tanggal salah (Gunakan YYYY-MM-DD).", rowNum))
			continue
		}

		parsedDate, err := parseExcelDate(dateStr)
		if err != nil {
			errs = append(errs, fmt.Sprintf("Baris %d: Format Tanggal salah (Gunakan YYYY-MM-DD).", rowNum))
			continue
		}

		if shiftName == "" {
			errs = append(errs, fmt.Sprintf("Baris %d: Nama Shift wajib diisi.", rowNum))
			continue
		}

		schedules = append(schedules, ScheduleRow{
			Username:  username,
			Date:      parsedDate,
			ShiftName: shiftName,
			RowNumber: rowNum,
		})
	}

	return schedules, errs, nil
}

func parseExcelDate(dateStr string) (string, error) {
	trimmed := strings.TrimSpace(dateStr)
	if _, err := time.Parse("2006-01-02", trimmed); err != nil {
		return "", fmt.Errorf("invalid date format %q", trimmed)
	}
	return trimmed, nil
}
