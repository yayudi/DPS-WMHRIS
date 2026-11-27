// Package domain defines core entities, domain errors, and validation helpers for the HRIS module.
package domain

import (
	"regexp"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/apperror"
)

// Attendance status constants matching the attendance_logs.status domain values.
const (
	AttendanceStatusHadir = "HADIR"
	AttendanceStatusSakit = "SAKIT"
	AttendanceStatusIzin  = "IZIN"
	AttendanceStatusCuti  = "CUTI"
	AttendanceStatusAlpha = "ALPHA"
	AttendanceStatusLibur = "LIBUR"
)

var (
	// ErrShiftNotFound is returned when a shift record cannot be found.
	ErrShiftNotFound = apperror.NotFound("hris.shift.not_found", "shift tidak ditemukan")
	// ErrCannotDeleteDefaultShift is returned when attempting to delete the active default shift.
	ErrCannotDeleteDefaultShift = apperror.Conflict("hris.shift.cannot_delete_default", "shift default tidak dapat dihapus")
	// ErrInvalidWorkDays is returned when work_days is not a comma-separated list of unique days 1-7.
	ErrInvalidWorkDays = apperror.Validation("hris.shift.err_invalid_work_days", "format work_days tidak valid, gunakan angka 1-7 unik dipisah koma (contoh: 1,2,3,4,5)")
	// ErrInvalidTimeFormat is returned when a shift time string is neither HH:mm nor HH:mm:ss.
	ErrInvalidTimeFormat = apperror.Validation("hris.shift.err_invalid_time_format", "format waktu tidak valid, gunakan HH:mm atau HH:mm:ss")
	// ErrInvalidDateRange is returned when startDate > endDate or the date span exceeds safe bounds.
	ErrInvalidDateRange = apperror.Validation("hris.attendance.err_invalid_date_range", "rentang tanggal tidak valid")
	// ErrInvalidMonthYear is returned when month is outside 1..12 or year is out of range.
	ErrInvalidMonthYear = apperror.Validation("hris.attendance.err_invalid_month_year", "bulan atau tahun tidak valid")
	// ErrUserNotFound is returned when a referenced employee/user does not exist.
	ErrUserNotFound = apperror.NotFound("hris.user.not_found", "pengguna tidak ditemukan")
	// ErrScheduleNotFound is returned when a user schedule record does not exist.
	ErrScheduleNotFound = apperror.NotFound("hris.schedule.not_found", "jadwal tidak ditemukan")
)

var workDaysPattern = regexp.MustCompile(`^[1-7](,[1-7])*$`)

// ValidateWorkDays checks that workDays is a comma-separated list of unique ISO weekday numbers (1=Mon .. 7=Sun).
func ValidateWorkDays(workDays string) error {
	trimmed := strings.TrimSpace(workDays)
	if !workDaysPattern.MatchString(trimmed) {
		return ErrInvalidWorkDays
	}
	seen := make(map[string]struct{}, 7)
	for _, day := range strings.Split(trimmed, ",") {
		if _, dup := seen[day]; dup {
			return ErrInvalidWorkDays
		}
		seen[day] = struct{}{}
	}
	return nil
}

// NormalizeShiftTime validates a shift clock string in HH:mm or HH:mm:ss format and returns HH:mm:ss.
func NormalizeShiftTime(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	for _, layout := range []string{"15:04:05", "15:04"} {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			return parsed.Format("15:04:05"), nil
		}
	}
	return "", ErrInvalidTimeFormat
}
