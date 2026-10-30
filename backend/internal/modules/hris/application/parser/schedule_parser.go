package hris_parser

import (
	"fmt"
	"time"

	"github.com/dps-wmhris/backend/internal/parser"
)

type ScheduleRow struct {
	Username  string
	Date      string
	ShiftName string
	RowNumber int
}

func ParseScheduleExcel(filepath string) ([]ScheduleRow, []string, error) {
	records, err := parser.ReadExcelFile(filepath)
	if err != nil {
		return nil, nil, fmt.Errorf("file Excel tidak valid atau rusak: %v", err)
	}

	if len(records) == 0 {
		return nil, nil, fmt.Errorf("file Excel kosong")
	}

	var schedules []ScheduleRow
	var errors []string

	for i, record := range records {
		rowNum := i + 2 // i=0 corresponds to row 2 in Excel (example row in template)
		if rowNum <= 2 { // Skip example row
			continue
		}

		username := parser.GetField(record, "Username", "username", "User", "user")
		dateStr := parser.GetField(record, "Date (YYYY-MM-DD)", "Date", "date", "Tanggal", "tanggal")
		shiftName := parser.GetField(record, "Shift Name", "Shift", "shift", "Nama Shift", "nama_shift")

		if username == "" && dateStr == "" && shiftName == "" {
			continue // Skip completely empty rows
		}

		if username == "" {
			errors = append(errors, fmt.Sprintf("Baris %d: Username wajib diisi.", rowNum))
			continue
		}
		if dateStr == "" {
			errors = append(errors, fmt.Sprintf("Baris %d: Format Tanggal salah (Gunakan YYYY-MM-DD).", rowNum))
			continue
		}

		// Handle different date formats or Excel serial dates
		parsedDate, err := parseExcelDate(dateStr)
		if err != nil {
			errors = append(errors, fmt.Sprintf("Baris %d: Format Tanggal salah (Gunakan YYYY-MM-DD).", rowNum))
			continue
		}

		if shiftName == "" {
			errors = append(errors, fmt.Sprintf("Baris %d: Nama Shift wajib diisi.", rowNum))
			continue
		}

		schedules = append(schedules, ScheduleRow{
			Username:  username,
			Date:      parsedDate,
			ShiftName: shiftName,
			RowNumber: rowNum,
		})
	}

	return schedules, errors, nil
}

func parseExcelDate(dateStr string) (string, error) {
	// Sometimes Excelize returns the raw numeric value if the style isn't fully supported
	// We check if it matches YYYY-MM-DD
	_, err := time.Parse("2006-01-02", dateStr)
	if err == nil {
		return dateStr, nil
	}

	// Try parsing standard excel short dates
	_, err = time.Parse("01-02-06", dateStr)
	if err == nil {
		// Just for simplicity, we require strictly YYYY-MM-DD in the template
		return "", fmt.Errorf("invalid format")
	}

	// Excel serial date check?
	// Excelize handles most date formats gracefully and returns YYYY-MM-DD if configured right
	return "", fmt.Errorf("invalid format")
}
