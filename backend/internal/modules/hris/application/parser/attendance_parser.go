// Package hris_parser parses attendance CSV exports and shift schedule Excel files for HRIS imports.
package hris_parser

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

// AttendanceRawLog stores a single classified clock punch for a day in minutes since midnight.
type AttendanceRawLog struct {
	Minutes int
	LogType string
}

// DailyLog aggregates all classified clock punches for a single user on a single calendar date.
type DailyLog struct {
	Logs []AttendanceRawLog
}

// UserAttendance aggregates parsed daily logs and source CSV row numbers for one employee.
type UserAttendance struct {
	ID         int
	Name       string
	Days       map[string]*DailyLog
	SourceRows []int
}

func timeToMinutes(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

var attendanceDateLayouts = []string{
	"2006-01-02 15:04:05",
	"2006-01-02 15:04",
	"2006/01/02 15:04:05",
	"2006/01/02 15:04",
	"02/01/2006 15:04:05",
	"02/01/2006 15:04",
	"02-01-2006 15:04:05",
	"02-01-2006 15:04",
}

// parseAttendanceDateTime strictly parses common attendance machine date-time formats,
// supporting both zero-padded layouts and single-digit month/day/hour variants without silent rollovers.
func parseAttendanceDateTime(raw string) (time.Time, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return time.Time{}, false
	}

	for _, layout := range attendanceDateLayouts {
		if parsed, err := time.ParseInLocation(layout, trimmed, time.Local); err == nil {
			return parsed, true
		}
	}

	// Fallback for non-zero-padded variants such as "2026/1/5 8:05" or "5/1/2026 8:05:00"
	parts := strings.Fields(trimmed)
	if len(parts) < 2 {
		return time.Time{}, false
	}
	dParts := strings.FieldsFunc(parts[0], func(r rune) bool {
		return r == '/' || r == '-'
	})
	tParts := strings.Split(parts[1], ":")
	if len(dParts) != 3 || len(tParts) < 2 || len(tParts) > 3 {
		return time.Time{}, false
	}

	p0, err0 := strconv.Atoi(dParts[0])
	p1, err1 := strconv.Atoi(dParts[1])
	p2, err2 := strconv.Atoi(dParts[2])
	hr, errH := strconv.Atoi(tParts[0])
	min, errM := strconv.Atoi(tParts[1])
	if err0 != nil || err1 != nil || err2 != nil || errH != nil || errM != nil {
		return time.Time{}, false
	}
	sec := 0
	if len(tParts) == 3 {
		var errS error
		sec, errS = strconv.Atoi(tParts[2])
		if errS != nil || sec < 0 || sec > 59 {
			return time.Time{}, false
		}
	}
	if hr < 0 || hr > 23 || min < 0 || min > 59 {
		return time.Time{}, false
	}

	var year, month, day int
	switch {
	case len(dParts[0]) == 4: // YYYY/M/D
		year, month, day = p0, p1, p2
	case len(dParts[2]) == 4: // D/M/YYYY
		day, month, year = p0, p1, p2
	default:
		return time.Time{}, false
	}

	if year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 {
		return time.Time{}, false
	}
	candidate := time.Date(year, time.Month(month), day, hr, min, sec, 0, time.Local)
	// Reject rolled-over dates such as 2026-02-31 -> 2026-03-03
	if candidate.Year() != year || int(candidate.Month()) != month || candidate.Day() != day {
		return time.Time{}, false
	}
	return candidate, true
}

// ParseAttendanceCSV reads a fingerprint-machine CSV stream (skipping 3 metadata lines before row 4 headers)
// and groups classified clock-in/break/clock-out logs per employee and date.
func ParseAttendanceCSV(r io.Reader, thresholds map[string]int) (map[string]*UserAttendance, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	// Skip first 3 metadata lines
	for i := 0; i < 3; i++ {
		_, err := reader.Read()
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil, apperror.Validation("hris.attendance.err_read_headers", "Gagal membaca header CSV absensi")
			}
			return nil, apperror.Validation("hris.attendance.err_skip_line", fmt.Sprintf("Error skipping line %d: %v", i+1, err))
		}
	}

	// Read header (Row 4)
	headers, err := reader.Read()
	if err != nil {
		return nil, apperror.Validation("hris.attendance.err_read_headers", "Gagal membaca header CSV absensi")
	}

	// Clean headers (remove UTF-8 BOM and trim)
	headerMap := make(map[string]int, len(headers))
	for i, h := range headers {
		cleanHeader := strings.TrimSpace(strings.TrimPrefix(h, "\xef\xbb\xbf"))
		headerMap[cleanHeader] = i
	}

	idxID := -1
	idxName := -1
	idxDate := -1

	for _, key := range []string{"User ID", "No.", "AC-No.", "ID Number"} {
		if val, ok := headerMap[key]; ok {
			idxID = val
			break
		}
	}
	for _, key := range []string{"Full Name", "Name", "Nama"} {
		if val, ok := headerMap[key]; ok {
			idxName = val
			break
		}
	}
	for _, key := range []string{"Date/Time", "Time", "Waktu", "DateTime"} {
		if val, ok := headerMap[key]; ok {
			idxDate = val
			break
		}
	}

	if idxID == -1 || idxDate == -1 {
		return nil, apperror.Validation("hris.attendance.err_missing_columns", "Kolom wajib tidak ditemukan: User ID atau Date/Time")
	}

	data := make(map[string]*UserAttendance)
	rowCount := 0

	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			continue // Skip malformed CSV row
		}

		rowCount++
		excelRow := rowCount + 4

		if len(row) <= idxID || len(row) <= idxDate {
			continue
		}

		idStr := strings.TrimSpace(row[idxID])
		nameStr := ""
		if idxName != -1 && len(row) > idxName {
			nameStr = strings.TrimSpace(row[idxName])
		}
		datetimeRaw := strings.TrimSpace(row[idxDate])

		if idStr == "" || datetimeRaw == "" {
			continue
		}

		dateObj, ok := parseAttendanceDateTime(datetimeRaw)
		if !ok {
			continue
		}

		dayKey := dateObj.Format("2006-01-02")
		minutes := timeToMinutes(dateObj)

		if _, exists := data[idStr]; !exists {
			idInt, _ := strconv.Atoi(idStr)
			data[idStr] = &UserAttendance{
				ID:         idInt,
				Name:       nameStr,
				Days:       make(map[string]*DailyLog),
				SourceRows: make([]int, 0),
			}
		}

		user := data[idStr]
		if _, exists := user.Days[dayKey]; !exists {
			user.Days[dayKey] = &DailyLog{
				Logs: make([]AttendanceRawLog, 0),
			}
		}

		user.SourceRows = append(user.SourceRows, excelRow)

		logType := determineLogType(minutes, dateObj.Weekday(), user.Days[dayKey].Logs, thresholds)
		if logType != "" {
			user.Days[dayKey].Logs = append(user.Days[dayKey].Logs, AttendanceRawLog{
				Minutes: minutes,
				LogType: logType,
			})
		}
	}

	return data, nil
}

func determineLogType(minutes int, weekday time.Weekday, existingLogs []AttendanceRawLog, thresholds map[string]int) string {
	getThreshold := func(key string, defaultVal int) int {
		if val, exists := thresholds[key]; exists {
			return val
		}
		return defaultVal
	}

	rangeMasukMulai := getThreshold("RANGE_MASUK_MULAI", 5*60)
	rangeMasukSelesai := getThreshold("RANGE_MASUK_SELESAI", 11*60)
	rangeIstirahatMulai := getThreshold("RANGE_ISTIRAHAT_MULAI", 11*60+30)
	rangeIstirahatSelesai := getThreshold("RANGE_ISTIRAHAT_SELESAI", 13*60+30)
	batasPulangSabtu := getThreshold("BATAS_PULANG_SABTU", 14*60)
	batasPulangBiasa := getThreshold("BATAS_PULANG_BIASA", 16*60)

	if minutes >= rangeMasukMulai && minutes <= rangeMasukSelesai {
		return "in"
	}

	if minutes >= rangeIstirahatMulai && minutes <= rangeIstirahatSelesai {
		if len(existingLogs) > 0 && existingLogs[len(existingLogs)-1].LogType == "break-in" {
			return "break-out"
		}
		return "break-in"
	}

	batasPulang := batasPulangBiasa
	if weekday == time.Saturday {
		batasPulang = batasPulangSabtu
	}

	if minutes >= batasPulang {
		return "out"
	}

	return ""
}
