package hris_parser

import (
	"fmt"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

type ScheduleRow struct {
	Username  string
	Date      string
	ShiftName string
	RowNumber int
}

func ParseScheduleExcel(filepath string) ([]ScheduleRow, []string, error) {
	f, err := excelize.OpenFile(filepath)
	if err != nil {
		return nil, nil, fmt.Errorf("file Excel tidak valid atau rusak: %v", err)
	}
	defer f.Close()

	// Assuming data is on the first sheet
	sheetList := f.GetSheetList()
	if len(sheetList) == 0 {
		return nil, nil, fmt.Errorf("file Excel kosong")
	}
	sheetName := sheetList[0]

	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, nil, err
	}

	var schedules []ScheduleRow
	var errors []string

	for i, row := range rows {
		rowNum := i + 1
		if rowNum <= 2 { // Skip header and example row
			continue
		}

		// Ensure row has enough columns
		var username, dateStr, shiftName string
		if len(row) > 0 {
			username = strings.TrimSpace(row[0])
		}
		if len(row) > 1 {
			dateStr = strings.TrimSpace(row[1])
		}
		if len(row) > 2 {
			shiftName = strings.TrimSpace(row[2])
		}

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
