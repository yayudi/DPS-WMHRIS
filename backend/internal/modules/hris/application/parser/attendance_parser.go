package hris_parser

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

type AttendanceRawLog struct {
	Minutes int
	LogType string
}

type DailyLog struct {
	Logs []AttendanceRawLog
}

type UserAttendance struct {
	ID         int
	Name       string
	Days       map[string]*DailyLog
	SourceRows []int
}

func timeToMinutes(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

func ParseAttendanceCSV(r io.Reader, thresholds map[string]int) (map[string]*UserAttendance, error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	// Skip first 3 lines
	for i := 0; i < 3; i++ {
		_, err := reader.Read()
		if err != nil && err != io.EOF {
			return nil, fmt.Errorf("error skipping line %d: %w", i+1, err)
		}
	}

	// Read header (Row 4)
	headers, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("error reading headers: %w", err)
	}

	// Clean headers (remove BOM and trim)
	headerMap := make(map[string]int)
	for i, h := range headers {
		cleanHeader := strings.TrimSpace(strings.TrimPrefix(h, "\xef\xbb\xbf"))
		headerMap[cleanHeader] = i
	}

	// Find indexes
	idxID := -1
	idxName := -1
	idxDate := -1

	// Matches for ID
	for _, key := range []string{"User ID", "No.", "AC-No.", "ID Number"} {
		if val, ok := headerMap[key]; ok {
			idxID = val
			break
		}
	}

	// Matches for Name
	for _, key := range []string{"Full Name", "Name", "Nama"} {
		if val, ok := headerMap[key]; ok {
			idxName = val
			break
		}
	}

	// Matches for Date
	for _, key := range []string{"Date/Time", "Time", "Waktu", "DateTime"} {
		if val, ok := headerMap[key]; ok {
			idxDate = val
			break
		}
	}

	if idxID == -1 || idxDate == -1 {
		return nil, fmt.Errorf("missing required columns: User ID or Date/Time")
	}

	data := make(map[string]*UserAttendance)
	rowCount := 0

	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // Skip bad rows
		}

		rowCount++
		excelRow := rowCount + 4

		// Safety check bounds
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

		var dateObj time.Time
		// Attempt to parse manually (e.g. YYYY/MM/DD HH:MM or YYYY-MM-DD HH:MM)
		parts := strings.Split(datetimeRaw, " ")
		if len(parts) >= 2 {
			datePart := parts[0]
			timePart := parts[1]
			dParts := strings.FieldsFunc(datePart, func(r rune) bool {
				return r == '/' || r == '-'
			})
			tParts := strings.Split(timePart, ":")

			if len(dParts) == 3 && len(tParts) >= 2 {
				y, _ := strconv.Atoi(dParts[0])
				m, _ := strconv.Atoi(dParts[1])
				d, _ := strconv.Atoi(dParts[2])
				hr, _ := strconv.Atoi(tParts[0])
				min, _ := strconv.Atoi(tParts[1])
				dateObj = time.Date(y, time.Month(m), d, hr, min, 0, 0, time.Local)
			}
		}

		// Fallback
		if dateObj.IsZero() {
			dateObj, _ = time.Parse("2006-01-02 15:04:05", datetimeRaw)
		}
		if dateObj.IsZero() {
			dateObj, _ = time.Parse("2006/01/02 15:04", datetimeRaw)
		}

		if dateObj.IsZero() {
			continue // skip invalid date
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

// Logic based on wmsConstants
func determineLogType(minutes int, weekday time.Weekday, existingLogs []AttendanceRawLog, thresholds map[string]int) string {
	getThreshold := func(key string, defaultVal int) int {
		if val, exists := thresholds[key]; exists {
			return val
		}
		return defaultVal
	}

	RANGE_MASUK_MULAI := getThreshold("RANGE_MASUK_MULAI", 5*60)
	RANGE_MASUK_SELESAI := getThreshold("RANGE_MASUK_SELESAI", 11*60)
	RANGE_ISTIRAHAT_MULAI := getThreshold("RANGE_ISTIRAHAT_MULAI", 11*60+30)
	RANGE_ISTIRAHAT_SELESAI := getThreshold("RANGE_ISTIRAHAT_SELESAI", 13*60+30)
	BATAS_PULANG_SABTU := getThreshold("BATAS_PULANG_SABTU", 14*60)
	BATAS_PULANG_BIASA := getThreshold("BATAS_PULANG_BIASA", 16*60)

	if minutes >= RANGE_MASUK_MULAI && minutes <= RANGE_MASUK_SELESAI {
		return "in"
	}

	if minutes >= RANGE_ISTIRAHAT_MULAI && minutes <= RANGE_ISTIRAHAT_SELESAI {
		if len(existingLogs) > 0 && existingLogs[len(existingLogs)-1].LogType == "break-in" {
			return "break-out"
		}
		return "break-in"
	}

	batasPulang := BATAS_PULANG_BIASA
	if weekday == time.Saturday {
		batasPulang = BATAS_PULANG_SABTU
	}

	if minutes >= batasPulang {
		return "out"
	}

	return ""
}
