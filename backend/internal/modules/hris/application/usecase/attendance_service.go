// Package usecase implements business use cases for HRIS attendance, shift, and schedule management.
package usecase

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	hris_parser "github.com/dps-wmhris/backend/internal/modules/hris/application/parser"
	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	iam_domain "github.com/dps-wmhris/backend/internal/modules/iam/domain"
	iam_port "github.com/dps-wmhris/backend/internal/modules/iam/port"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

// Default working-hour constants (in minutes from midnight) used as fallback when no shift is assigned.
const (
	JamKerjaMulai          = 480 // 08:00
	JamKerjaSelesai        = 960 // 16:00
	JamKerjaSelesaiSabtu   = 840 // 14:00
	maxAttendanceRangeDays = 366
	minAttendanceYear      = 1900
	maxAttendanceYear      = 2100
)

type attendanceUseCaseImpl struct {
	txManager      database.TransactionManager
	attendanceRepo hris_port.AttendanceRepository
	userRepo       iam_port.UserRepository
	shiftRepo      hris_port.ShiftRepository
	scheduleRepo   hris_port.ScheduleRepository
	settingRepo    system_port.SettingRepository
}

// NewAttendanceUseCase creates an AttendanceUseCase wired with transaction management and outbound ports.
func NewAttendanceUseCase(
	txManager database.TransactionManager,
	attendanceRepo hris_port.AttendanceRepository,
	userRepo iam_port.UserRepository,
	shiftRepo hris_port.ShiftRepository,
	scheduleRepo hris_port.ScheduleRepository,
	settingRepo system_port.SettingRepository,
) hris_port.AttendanceUseCase {
	return &attendanceUseCaseImpl{
		txManager:      txManager,
		attendanceRepo: attendanceRepo,
		userRepo:       userRepo,
		shiftRepo:      shiftRepo,
		scheduleRepo:   scheduleRepo,
		settingRepo:    settingRepo,
	}
}

func (s *attendanceUseCaseImpl) GetIndexes(ctx context.Context) (map[int][]int, error) {
	return s.attendanceRepo.GetIndexes(ctx)
}

func (s *attendanceUseCaseImpl) GetHistory(ctx context.Context, startDate string, endDate string, search string) ([]map[string]any, error) {
	if _, _, err := parseDateRange(startDate, endDate, 0); err != nil {
		return nil, err
	}
	rows, err := s.attendanceRepo.GetHistory(ctx, startDate, endDate, search)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		return []map[string]any{}, nil
	}
	return rows, nil
}

func (s *attendanceUseCaseImpl) loadHolidays(ctx context.Context, startYear, endYear int) (map[string]bool, error) {
	holidayMap := make(map[string]bool)

	for y := startYear; y <= endYear; y++ {
		hMap, err := s.attendanceRepo.GetHolidays(ctx, y)
		if err != nil {
			return nil, err
		}
		for k, v := range hMap {
			holidayMap[k] = v
		}
	}
	return holidayMap, nil
}

func parseDateRange(startDate, endDate string, maxDays int) (time.Time, time.Time, error) {
	start, err := time.Parse("2006-01-02", strings.TrimSpace(startDate))
	if err != nil {
		return time.Time{}, time.Time{}, domain.ErrInvalidDateRange
	}
	end, err := time.Parse("2006-01-02", strings.TrimSpace(endDate))
	if err != nil {
		return time.Time{}, time.Time{}, domain.ErrInvalidDateRange
	}
	if start.After(end) {
		return time.Time{}, time.Time{}, domain.ErrInvalidDateRange
	}
	if maxDays > 0 {
		days := int(end.Sub(start)/(24*time.Hour)) + 1
		if days > maxDays {
			return time.Time{}, time.Time{}, domain.ErrInvalidDateRange
		}
	}
	return start, end, nil
}

func buildActiveAttendanceUsers(allUsers []iam_domain.User) []map[string]any {
	simpleUsers := make([]map[string]any, 0, len(allUsers))
	for _, u := range allUsers {
		if !u.ExcludeFromAttendance {
			simpleUsers = append(simpleUsers, map[string]any{
				"id":       u.ID,
				"username": u.Username,
			})
		}
	}
	return simpleUsers
}

func calculateWorkingCalendar(start, end time.Time, holidayMap map[string]bool) map[string]any {
	totalIdealWorkMinutes := 0
	hariKerja := 0
	hariLibur := 0

	for current := start; !current.After(end); current = current.AddDate(0, 0, 1) {
		ymd := current.Format("2006-01-02")
		dayOfWeek := int(current.Weekday())

		if dayOfWeek == 0 || holidayMap[ymd] {
			hariLibur++
		} else {
			hariKerja++
			if dayOfWeek == 6 {
				totalIdealWorkMinutes += JamKerjaSelesaiSabtu - JamKerjaMulai
			} else {
				totalIdealWorkMinutes += JamKerjaSelesai - JamKerjaMulai
			}
		}
	}

	return map[string]any{
		"idealMinutes": totalIdealWorkMinutes,
		"workDays":     hariKerja,
		"holidayDays":  hariLibur,
		"holidayMap":   holidayMap,
	}
}

func (s *attendanceUseCaseImpl) GetRangeData(ctx context.Context, startDate string, endDate string) (*hris_dto.AttendanceRangeResponse, error) {
	start, end, err := parseDateRange(startDate, endDate, maxAttendanceRangeDays)
	if err != nil {
		return nil, err
	}

	holidayMap, err := s.loadHolidays(ctx, start.Year(), end.Year())
	if err != nil {
		return nil, err
	}

	allUsers, err := s.userRepo.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	logRows, err := s.attendanceRepo.GetRangeLogs(ctx, startDate, endDate)
	if err != nil {
		return nil, err
	}
	if logRows == nil {
		logRows = []map[string]any{}
	}

	return &hris_dto.AttendanceRangeResponse{
		AllUsers:   buildActiveAttendanceUsers(allUsers),
		LogRows:    logRows,
		GlobalInfo: calculateWorkingCalendar(start, end, holidayMap),
	}, nil
}

func (s *attendanceUseCaseImpl) GetMonthlyData(ctx context.Context, year int, month int) (*hris_dto.AttendanceRangeResponse, error) {
	if year < minAttendanceYear || year > maxAttendanceYear || month < 1 || month > 12 {
		return nil, domain.ErrInvalidMonthYear
	}

	holidayMap, err := s.loadHolidays(ctx, year, year)
	if err != nil {
		return nil, err
	}

	allUsers, err := s.userRepo.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	logRows, err := s.attendanceRepo.GetMonthlyLogs(ctx, year, month)
	if err != nil {
		return nil, err
	}
	if logRows == nil {
		logRows = []map[string]any{}
	}

	firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, -1)

	return &hris_dto.AttendanceRangeResponse{
		AllUsers:   buildActiveAttendanceUsers(allUsers),
		LogRows:    logRows,
		GlobalInfo: calculateWorkingCalendar(firstDay, lastDay, holidayMap),
	}, nil
}

func timeToMinutes(timeStr string) int {
	if timeStr == "" {
		return 0
	}
	parts := strings.Split(strings.TrimSpace(timeStr), ":")
	if len(parts) >= 2 {
		h, errH := strconv.Atoi(parts[0])
		m, errM := strconv.Atoi(parts[1])
		if errH == nil && errM == nil {
			return h*60 + m
		}
	}
	return 0
}

func minToTimeString(minutes int) string {
	return fmt.Sprintf("%02d:%02d:00", minutes/60, minutes%60)
}

func resolveShiftWorkWindow(shift *domain.Shift) (startMin int, endMin int, tolerance int) {
	if shift == nil {
		return JamKerjaMulai, JamKerjaSelesai, 0
	}
	return timeToMinutes(shift.StartTime), timeToMinutes(shift.EndTime), shift.FlexibleMinutes
}

func normalizeOptionalTime(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, nil
	}
	normalized, err := domain.NormalizeShiftTime(trimmed)
	if err != nil {
		return nil, err
	}
	return &normalized, nil
}

func (s *attendanceUseCaseImpl) ProcessImport(ctx context.Context, jobID int, filePath string, isDryRun bool) (string, error) {
	log.Printf("Memproses import absensi (job=%d): %s", jobID, filePath)

	settingsMap, err := s.settingRepo.GetSettingsAsMap(ctx)
	if err != nil {
		log.Printf("Gagal mengambil konfigurasi absensi: %v", err)
	}

	thresholds := make(map[string]int, len(settingsMap))
	for k, v := range settingsMap {
		if v.ValueInt != nil {
			thresholds[k] = *v.ValueInt
		}
	}

	cleanPath := utils.ResolveStoragePath(filePath)
	file, err := os.Open(cleanPath)
	if err != nil {
		return "", apperror.Validation("hris.attendance.err_open_file", "gagal membuka file absensi", map[string]any{"error": err.Error()})
	}
	defer file.Close()

	data, err := hris_parser.ParseAttendanceCSV(file, thresholds)
	if err != nil {
		return "", apperror.Validation("hris.attendance.err_parse_csv", "gagal memparsing CSV absensi", map[string]any{"error": err.Error()})
	}

	log.Printf("Berhasil memparsing %d user dari CSV", len(data))

	if isDryRun {
		log.Println("Dry run absensi selesai. Tidak ada perubahan yang disimpan.")
		summary := i18n.T(ctx, "hris.attendance.dry_run_summary", map[string]any{"count": len(data)})
		if summary == "hris.attendance.dry_run_summary" {
			summary = fmt.Sprintf("Validasi sukses untuk %d baris/user", len(data))
		}
		return summary, nil
	}

	// Preload all active users once to eliminate N+1 FindByUsername lookups.
	allUsers, err := s.userRepo.GetAll(ctx)
	if err != nil {
		return "", apperror.Internal("hris.attendance.err_fetch_users_failed", "Gagal memuat data user", err)
	}
	userByUsername := make(map[string]iam_domain.User, len(allUsers))
	for _, u := range allUsers {
		userByUsername[strings.ToLower(strings.TrimSpace(u.Username))] = u
	}

	// Sort imported user keys deterministically so database locks are acquired in a consistent order.
	sortedIDs := make([]string, 0, len(data))
	for idStr := range data {
		sortedIDs = append(sortedIDs, idStr)
	}
	sort.Strings(sortedIDs)

	type userLogBatch struct {
		username string
		entries  []*domain.AttendanceLog
	}
	batches := make([]userLogBatch, 0, len(sortedIDs))

	for _, idStr := range sortedIDs {
		userAttendance := data[idStr]
		user, ok := userByUsername[strings.ToLower(strings.TrimSpace(userAttendance.Name))]
		if !ok {
			user, ok = userByUsername[strings.ToLower(strings.TrimSpace(idStr))]
			if !ok {
				log.Printf("Skip user ID %s (Name: %s): tidak ditemukan di DB", idStr, userAttendance.Name)
				continue
			}
		}

		if len(userAttendance.Days) == 0 {
			continue
		}

		dates := make([]string, 0, len(userAttendance.Days))
		for dateStr := range userAttendance.Days {
			dates = append(dates, dateStr)
		}
		sort.Strings(dates)

		// Preload schedules for this user's date span once instead of querying GetByDate per day.
		scheduleByDate := make(map[string]hris_dto.ScheduleResponse)
		if rangeSchedules, schErr := s.scheduleRepo.GetByRange(ctx, user.ID, dates[0], dates[len(dates)-1]); schErr == nil {
			for _, sc := range rangeSchedules {
				key := sc.Date
				if len(key) >= 10 {
					key = key[:10]
				}
				scheduleByDate[key] = sc
			}
		}

		defaultShift, _ := s.shiftRepo.GetUserShift(ctx, user.Username)

		entries := make([]*domain.AttendanceLog, 0, len(dates))
		for _, dateStr := range dates {
			dailyLog := userAttendance.Days[dateStr]
			var checkIn *string
			var checkOut *string
			inMins := -1
			outMins := -1

			for _, l := range dailyLog.Logs {
				if l.LogType == "in" && inMins == -1 {
					inMins = l.Minutes
					t := minToTimeString(inMins)
					checkIn = &t
				}
				if l.LogType == "out" {
					outMins = l.Minutes
					t := minToTimeString(outMins)
					checkOut = &t
				}
			}

			var shift *domain.Shift
			if sc, hasSchedule := scheduleByDate[dateStr]; hasSchedule {
				shift = &domain.Shift{
					StartTime:       sc.StartTime,
					EndTime:         sc.EndTime,
					FlexibleMinutes: sc.FlexibleMinutes,
				}
			} else {
				shift = defaultShift
			}

			latenessMinutes := 0
			overtimeMinutes := 0
			if shift != nil {
				shiftStartMin := timeToMinutes(shift.StartTime)
				shiftEndMin := timeToMinutes(shift.EndTime)
				tolerance := shift.FlexibleMinutes

				if inMins != -1 && inMins > (shiftStartMin+tolerance) {
					latenessMinutes = inMins - shiftStartMin
				}
				if outMins != -1 && outMins > shiftEndMin {
					overtimeMinutes = outMins - shiftEndMin
				}
			}

			status := domain.AttendanceStatusHadir
			entries = append(entries, &domain.AttendanceLog{
				Username:          user.Username,
				Date:              dateStr,
				CheckIn:           checkIn,
				CheckOut:          checkOut,
				LatenessMinutes:   latenessMinutes,
				OvertimeMinutes:   overtimeMinutes,
				LatePardonMinutes: -1, // Preserve existing late_pardon_minutes during bulk import
				Status:            &status,
			})
		}

		batches = append(batches, userLogBatch{
			username: user.Username,
			entries:  entries,
		})
	}

	successCount := 0
	if err := s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		for _, batch := range batches {
			for _, entry := range batch.entries {
				if err := s.attendanceRepo.UpsertLog(txCtx, entry); err != nil {
					return apperror.Internal(
						"hris.attendance.err_save_log_failed",
						fmt.Sprintf("gagal menyimpan log absensi %s tanggal %s", batch.username, entry.Date),
						err,
						map[string]any{"username": batch.username, "date": entry.Date},
					)
				}
			}
			successCount++
		}
		return nil
	}); err != nil {
		return "", err
	}

	log.Printf("Import absensi berhasil disimpan ke DB untuk %d user", successCount)

	summary := i18n.T(ctx, "hris.attendance.import_summary", map[string]any{"count": successCount})
	if summary == "hris.attendance.import_summary" {
		summary = fmt.Sprintf("Berhasil mengimpor data untuk %d user", successCount)
	}
	return summary, nil
}

func (s *attendanceUseCaseImpl) UpdateLog(ctx context.Context, req hris_dto.UpdateLogRequest) error {
	username := strings.TrimSpace(req.Username)
	dateStr := strings.TrimSpace(req.Date)
	if _, err := time.Parse("2006-01-02", dateStr); err != nil {
		return domain.ErrInvalidDateRange
	}

	timeIn, err := normalizeOptionalTime(req.TimeIn)
	if err != nil {
		return err
	}
	timeOut, err := normalizeOptionalTime(req.TimeOut)
	if err != nil {
		return err
	}

	user, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.ErrUserNotFound
		}
		return err
	}
	if user == nil {
		return domain.ErrUserNotFound
	}

	var shift *domain.Shift
	schedule, err := s.scheduleRepo.GetByDate(ctx, user.ID, dateStr)
	if err == nil && schedule != nil {
		shift = &domain.Shift{
			StartTime:       schedule.StartTime,
			EndTime:         schedule.EndTime,
			FlexibleMinutes: schedule.FlexibleMinutes,
		}
	} else {
		shift, _ = s.shiftRepo.GetUserShift(ctx, username)
	}

	shiftStartMin, shiftEndMin, tolerance := resolveShiftWorkWindow(shift)

	return s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		latePardonMinutes := 0
		existingLog, err := s.attendanceRepo.GetLogByUsernameAndDate(txCtx, username, dateStr)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if existingLog != nil {
			latePardonMinutes = existingLog.LatePardonMinutes
		}
		if req.LatePardonMinutes != nil {
			latePardonMinutes = *req.LatePardonMinutes
		}

		latenessMinutes := 0
		overtimeMinutes := 0

		if timeIn != nil {
			inMinutes := timeToMinutes(*timeIn)
			if inMinutes > (shiftStartMin + tolerance) {
				actualLateness := inMinutes - shiftStartMin
				latenessMinutes = actualLateness - latePardonMinutes
				if latenessMinutes < 0 {
					latenessMinutes = 0
				}
			}
		}

		if timeOut != nil {
			outMinutes := timeToMinutes(*timeOut)
			if outMinutes > shiftEndMin {
				overtimeMinutes = outMinutes - shiftEndMin
			}
		}

		var statusPtr *string
		if trimmedStatus := strings.TrimSpace(req.Status); trimmedStatus != "" {
			statusPtr = &trimmedStatus
		} else if existingLog != nil && existingLog.Status != nil {
			statusPtr = existingLog.Status
		} else {
			defaultStatus := domain.AttendanceStatusHadir
			statusPtr = &defaultStatus
		}

		logEntry := &domain.AttendanceLog{
			Username:          username,
			Date:              dateStr,
			CheckIn:           timeIn,
			CheckOut:          timeOut,
			LatenessMinutes:   latenessMinutes,
			OvertimeMinutes:   overtimeMinutes,
			LatePardonMinutes: latePardonMinutes,
			Status:            statusPtr,
			Notes:             req.Notes,
		}

		return s.attendanceRepo.UpsertLog(txCtx, logEntry)
	})
}
