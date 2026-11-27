package usecase

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"testing"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	iam_domain "github.com/dps-wmhris/backend/internal/modules/iam/domain"
	iam_port "github.com/dps-wmhris/backend/internal/modules/iam/port"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/xuri/excelize/v2"
)

type mockTxManager struct {
	calls int
}

func (m *mockTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	m.calls++
	return fn(ctx)
}

type mockAttendanceRepo struct {
	hris_port.AttendanceRepository
	holidays        map[int]map[string]bool
	rangeLogs       []map[string]any
	monthlyLogs     []map[string]any
	historyLogs     []map[string]any
	existingLog     *domain.AttendanceLog
	existingLogErr  error
	upserted        []*domain.AttendanceLog
	upsertErrAtCall int
	upsertErr       error
}

func (m *mockAttendanceRepo) GetHolidays(_ context.Context, year int) (map[string]bool, error) {
	if m.holidays != nil && m.holidays[year] != nil {
		return m.holidays[year], nil
	}
	return map[string]bool{}, nil
}

func (m *mockAttendanceRepo) GetRangeLogs(_ context.Context, _, _ string) ([]map[string]any, error) {
	return m.rangeLogs, nil
}

func (m *mockAttendanceRepo) GetMonthlyLogs(_ context.Context, _, _ int) ([]map[string]any, error) {
	return m.monthlyLogs, nil
}

func (m *mockAttendanceRepo) GetHistory(_ context.Context, _, _, _ string) ([]map[string]any, error) {
	return m.historyLogs, nil
}

func (m *mockAttendanceRepo) GetLogByUsernameAndDate(_ context.Context, _, _ string) (*domain.AttendanceLog, error) {
	if m.existingLogErr != nil {
		return nil, m.existingLogErr
	}
	return m.existingLog, nil
}

func (m *mockAttendanceRepo) UpsertLog(_ context.Context, logEntry *domain.AttendanceLog) error {
	m.upserted = append(m.upserted, logEntry)
	if m.upsertErr != nil && (m.upsertErrAtCall == 0 || len(m.upserted) == m.upsertErrAtCall) {
		return m.upsertErr
	}
	return nil
}

type mockUserRepo struct {
	iam_port.UserRepository
	users           []iam_domain.User
	getAllCalls     int
	findByNameCalls int
	findByNameErr   error
	byUsername      map[string]*iam_domain.User
}

func (m *mockUserRepo) GetAll(_ context.Context) ([]iam_domain.User, error) {
	m.getAllCalls++
	return m.users, nil
}

func (m *mockUserRepo) FindByUsername(_ context.Context, username string) (*iam_domain.User, error) {
	m.findByNameCalls++
	if m.findByNameErr != nil {
		return nil, m.findByNameErr
	}
	if u, ok := m.byUsername[username]; ok {
		return u, nil
	}
	return nil, sql.ErrNoRows
}

type mockShiftRepo struct {
	hris_port.ShiftRepository
	shifts           []domain.Shift
	byID             map[int]*domain.Shift
	userShift        *domain.Shift
	userShiftErr     error
	clearDefaultHits int
	created          []*domain.Shift
	updated          []*domain.Shift
	deletedIDs       []int
}

func (m *mockShiftRepo) GetAll(_ context.Context) ([]domain.Shift, error) {
	return m.shifts, nil
}

func (m *mockShiftRepo) GetByID(_ context.Context, id int) (*domain.Shift, error) {
	if m.byID != nil {
		if sh, ok := m.byID[id]; ok {
			copyShift := *sh
			return &copyShift, nil
		}
	}
	return nil, sql.ErrNoRows
}

func (m *mockShiftRepo) Create(_ context.Context, shift *domain.Shift) (int, error) {
	copyShift := *shift
	m.created = append(m.created, &copyShift)
	return len(m.created) + 10, nil
}

func (m *mockShiftRepo) Update(_ context.Context, shift *domain.Shift) error {
	copyShift := *shift
	m.updated = append(m.updated, &copyShift)
	return nil
}

func (m *mockShiftRepo) Delete(_ context.Context, id int) error {
	m.deletedIDs = append(m.deletedIDs, id)
	return nil
}

func (m *mockShiftRepo) ClearDefault(_ context.Context) error {
	m.clearDefaultHits++
	return nil
}

func (m *mockShiftRepo) GetUserShift(_ context.Context, _ string) (*domain.Shift, error) {
	if m.userShiftErr != nil {
		return nil, m.userShiftErr
	}
	return m.userShift, nil
}

type mockScheduleRepo struct {
	hris_port.ScheduleRepository
	byRange         []hris_dto.ScheduleResponse
	getByRangeCalls int
	byDate          *hris_dto.ScheduleResponse
	byDateErr       error
	getByDateCalls  int
	upserts         []struct {
		userID  int
		shiftID int
		date    string
	}
	upsertErrAtCall int
	upsertErr       error
	deleted         []struct {
		userID int
		date   string
	}
}

func (m *mockScheduleRepo) GetByRange(_ context.Context, _ int, _, _ string) ([]hris_dto.ScheduleResponse, error) {
	m.getByRangeCalls++
	return m.byRange, nil
}

func (m *mockScheduleRepo) GetByDate(_ context.Context, _ int, _ string) (*hris_dto.ScheduleResponse, error) {
	m.getByDateCalls++
	if m.byDateErr != nil {
		return nil, m.byDateErr
	}
	return m.byDate, nil
}

func (m *mockScheduleRepo) Upsert(_ context.Context, userID int, shiftID int, date string, _ *int) error {
	m.upserts = append(m.upserts, struct {
		userID  int
		shiftID int
		date    string
	}{userID: userID, shiftID: shiftID, date: date})
	if m.upsertErr != nil && (m.upsertErrAtCall == 0 || len(m.upserts) == m.upsertErrAtCall) {
		return m.upsertErr
	}
	return nil
}

func (m *mockScheduleRepo) Delete(_ context.Context, userID int, date string) error {
	m.deleted = append(m.deleted, struct {
		userID int
		date   string
	}{userID: userID, date: date})
	return nil
}

type mockSettingRepo struct {
	system_port.SettingRepository
	settings map[string]system_domain.SystemSetting
}

func (m *mockSettingRepo) GetSettingsAsMap(_ context.Context) (map[string]system_domain.SystemSetting, error) {
	if m.settings == nil {
		return map[string]system_domain.SystemSetting{}, nil
	}
	return m.settings, nil
}

func strPtr(s string) *string { return &s }
func intPtr(v int) *int       { return &v }
func makeUser(id int, username string, exclude bool) iam_domain.User {
	return iam_domain.User{
		BaseEntity:            kernel.BaseEntity{ID: id},
		Username:              username,
		ExcludeFromAttendance: exclude,
	}
}

func TestAttendanceUseCase_UpdateLog_NilShiftFallbackAndEmptyTimes(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockTxManager{}
	attRepo := &mockAttendanceRepo{}
	budi := makeUser(7, "budi", false)
	userRepo := &mockUserRepo{
		byUsername: map[string]*iam_domain.User{
			"budi": &budi,
		},
	}
	shiftRepo := &mockShiftRepo{userShift: nil, userShiftErr: sql.ErrNoRows}
	scheduleRepo := &mockScheduleRepo{byDate: nil, byDateErr: sql.ErrNoRows}
	settingRepo := &mockSettingRepo{}

	uc := NewAttendanceUseCase(txMgr, attRepo, userRepo, shiftRepo, scheduleRepo, settingRepo)

	// 1. Nil shift must NOT panic; falls back to JamKerjaMulai (08:00) & JamKerjaSelesai (16:00).
	err := uc.UpdateLog(ctx, hris_dto.UpdateLogRequest{
		Username:          "budi",
		Date:              "2026-03-02",
		TimeIn:            strPtr("08:30"),
		TimeOut:           strPtr("16:45"),
		Status:            domain.AttendanceStatusHadir,
		LatePardonMinutes: intPtr(10),
	})
	if err != nil {
		t.Fatalf("unexpected error on nil-shift fallback: %v", err)
	}
	if txMgr.calls != 1 {
		t.Fatalf("expected 1 transaction, got %d", txMgr.calls)
	}
	if len(attRepo.upserted) != 1 {
		t.Fatalf("expected 1 upserted log, got %d", len(attRepo.upserted))
	}
	got := attRepo.upserted[0]
	if got.CheckIn == nil || *got.CheckIn != "08:30:00" {
		t.Fatalf("expected CheckIn 08:30:00, got %v", got.CheckIn)
	}
	if got.CheckOut == nil || *got.CheckOut != "16:45:00" {
		t.Fatalf("expected CheckOut 16:45:00, got %v", got.CheckOut)
	}
	if got.LatenessMinutes != 20 { // 30 - 10 pardon
		t.Fatalf("expected lateness 20, got %d", got.LatenessMinutes)
	}
	if got.OvertimeMinutes != 45 {
		t.Fatalf("expected overtime 45, got %d", got.OvertimeMinutes)
	}

	// 2. Empty timeIn/timeOut from AttendanceEditModal.vue normalized to nil.
	err = uc.UpdateLog(ctx, hris_dto.UpdateLogRequest{
		Username: "budi",
		Date:     "2026-03-03",
		TimeIn:   strPtr(""),
		TimeOut:  strPtr("   "),
		Status:   domain.AttendanceStatusSakit,
	})
	if err != nil {
		t.Fatalf("unexpected error on empty times: %v", err)
	}
	gotEmpty := attRepo.upserted[1]
	if gotEmpty.CheckIn != nil || gotEmpty.CheckOut != nil {
		t.Fatalf("expected nil CheckIn/CheckOut for empty strings, got %v / %v", gotEmpty.CheckIn, gotEmpty.CheckOut)
	}

	// 3. Invalid time rejected with ErrInvalidTimeFormat.
	err = uc.UpdateLog(ctx, hris_dto.UpdateLogRequest{
		Username: "budi",
		Date:     "2026-03-03",
		TimeIn:   strPtr("25:99"),
	})
	if !errors.Is(err, domain.ErrInvalidTimeFormat) {
		t.Fatalf("expected ErrInvalidTimeFormat, got %v", err)
	}

	// 4. Unknown user maps sql.ErrNoRows to ErrUserNotFound.
	err = uc.UpdateLog(ctx, hris_dto.UpdateLogRequest{
		Username: "ghost",
		Date:     "2026-03-03",
	})
	if !errors.Is(err, domain.ErrUserNotFound) {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}
}

func TestAttendanceUseCase_GetRangeAndMonthlyValidation(t *testing.T) {
	ctx := context.Background()
	attRepo := &mockAttendanceRepo{
		holidays: map[int]map[string]bool{
			2026: {"2026-03-04": true}, // Wednesday holiday
		},
	}
	userRepo := &mockUserRepo{
		users: []iam_domain.User{
			makeUser(1, "alice", false),
			makeUser(2, "admin_hidden", true),
		},
	}
	uc := NewAttendanceUseCase(&mockTxManager{}, attRepo, userRepo, &mockShiftRepo{}, &mockScheduleRepo{}, &mockSettingRepo{})

	// Inverted date range
	if _, err := uc.GetRangeData(ctx, "2026-03-10", "2026-03-01"); !errors.Is(err, domain.ErrInvalidDateRange) {
		t.Fatalf("expected ErrInvalidDateRange for inverted range, got %v", err)
	}
	// Exceeds 366 days
	if _, err := uc.GetRangeData(ctx, "2026-01-01", "2027-01-05"); !errors.Is(err, domain.ErrInvalidDateRange) {
		t.Fatalf("expected ErrInvalidDateRange for >366 days, got %v", err)
	}
	// Invalid month/year
	if _, err := uc.GetMonthlyData(ctx, 2026, 13); !errors.Is(err, domain.ErrInvalidMonthYear) {
		t.Fatalf("expected ErrInvalidMonthYear for month=13, got %v", err)
	}
	if _, err := uc.GetMonthlyData(ctx, 1800, 1); !errors.Is(err, domain.ErrInvalidMonthYear) {
		t.Fatalf("expected ErrInvalidMonthYear for year=1800, got %v", err)
	}

	// Valid Mon 2026-03-02 .. Sun 2026-03-08:
	// Mon(480), Tue(480), Wed(holiday), Thu(480), Fri(480), Sat(360), Sun(holiday) -> 5 workDays, 2 holidayDays, 2280 idealMinutes
	res, err := uc.GetRangeData(ctx, "2026-03-02", "2026-03-08")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.AllUsers) != 1 || res.AllUsers[0]["username"] != "alice" {
		t.Fatalf("expected only non-excluded user alice, got %+v", res.AllUsers)
	}
	if res.LogRows == nil {
		t.Fatalf("expected non-nil empty slice for LogRows")
	}
	if res.GlobalInfo["workDays"] != 5 || res.GlobalInfo["holidayDays"] != 2 || res.GlobalInfo["idealMinutes"] != 2280 {
		t.Fatalf("unexpected globalInfo: %+v", res.GlobalInfo)
	}
}

func TestAttendanceUseCase_ProcessImport_PreloadAndAtomicRollback(t *testing.T) {
	ctx := context.Background()
	tmpDir := t.TempDir()
	csvPath := filepath.Join(tmpDir, "attendance.csv")
	csvContent := "Meta1\nMeta2\nMeta3\n" +
		"User ID,Nama,Waktu\n" +
		"101,Budi,2026/03/02 08:20\n" +
		"101,Budi,2026/03/02 17:30\n" +
		"101,Budi,2026/03/03 08:05\n" +
		"999,UnknownUser,2026/03/02 08:00\n"
	if err := os.WriteFile(csvPath, []byte(csvContent), 0o600); err != nil {
		t.Fatalf("failed to write temp csv: %v", err)
	}

	txMgr := &mockTxManager{}
	attRepo := &mockAttendanceRepo{}
	userRepo := &mockUserRepo{
		users: []iam_domain.User{makeUser(7, "budi", false)},
	}
	shiftRepo := &mockShiftRepo{
		userShift: &domain.Shift{StartTime: "08:00:00", EndTime: "16:00:00", FlexibleMinutes: 10},
	}
	scheduleRepo := &mockScheduleRepo{
		byRange: []hris_dto.ScheduleResponse{
			{UserID: 7, Date: "2026-03-02", StartTime: "08:00:00", EndTime: "17:00:00", FlexibleMinutes: 5},
		},
	}
	uc := NewAttendanceUseCase(txMgr, attRepo, userRepo, shiftRepo, scheduleRepo, &mockSettingRepo{})

	// Dry run should not touch DB writes or txManager
	drySummary, err := uc.ProcessImport(ctx, 1, csvPath, true)
	if err != nil || drySummary == "" {
		t.Fatalf("expected successful dry run, got summary=%q err=%v", drySummary, err)
	}
	if txMgr.calls != 0 || len(attRepo.upserted) != 0 {
		t.Fatalf("dry run must not execute transactions or upserts")
	}

	// Real run: verify O(1) user preload & single GetByRange schedule preload (no N+1)
	summary, err := uc.ProcessImport(ctx, 2, csvPath, false)
	if err != nil || summary == "" {
		t.Fatalf("expected successful import, got summary=%q err=%v", summary, err)
	}
	if userRepo.getAllCalls != 1 || userRepo.findByNameCalls != 0 {
		t.Fatalf("expected 1 GetAll & 0 FindByUsername calls, got %d / %d", userRepo.getAllCalls, userRepo.findByNameCalls)
	}
	if scheduleRepo.getByRangeCalls != 1 || scheduleRepo.getByDateCalls != 0 {
		t.Fatalf("expected 1 GetByRange & 0 GetByDate calls, got %d / %d", scheduleRepo.getByRangeCalls, scheduleRepo.getByDateCalls)
	}
	if txMgr.calls != 1 || len(attRepo.upserted) != 2 {
		t.Fatalf("expected 1 tx and 2 upserted logs, got tx=%d logs=%d", txMgr.calls, len(attRepo.upserted))
	}
	// 2026-03-02 uses schedule override (08:00-17:00, flex 5): in=08:20 -> late=20, out=17:30 -> overtime=30
	if attRepo.upserted[0].Date != "2026-03-02" || attRepo.upserted[0].LatenessMinutes != 20 || attRepo.upserted[0].OvertimeMinutes != 30 || attRepo.upserted[0].LatePardonMinutes != -1 {
		t.Fatalf("unexpected 2026-03-02 log entry: %+v", attRepo.upserted[0])
	}

	// Mid-batch upsert failure must fail atomically instead of silently succeeding
	attRepoFail := &mockAttendanceRepo{upsertErrAtCall: 2, upsertErr: errors.New("db write fail")}
	ucFail := NewAttendanceUseCase(&mockTxManager{}, attRepoFail, userRepo, shiftRepo, scheduleRepo, &mockSettingRepo{})
	if _, err := ucFail.ProcessImport(ctx, 3, csvPath, false); err == nil {
		t.Fatalf("expected error on mid-batch UpsertLog failure, got nil")
	}
}

func TestScheduleUseCase_GenerateTemplate_WorkbookRemainsOpenWithDropdowns(t *testing.T) {
	ctx := context.Background()
	userRepo := &mockUserRepo{
		users: []iam_domain.User{makeUser(1, "alice", false), makeUser(2, "budi", false)},
	}
	shiftRepo := &mockShiftRepo{
		shifts: []domain.Shift{
			{BaseEntity: kernel.BaseEntity{ID: 1}, Name: "Shift Pagi"},
			{BaseEntity: kernel.BaseEntity{ID: 2}, Name: "Shift Malam"},
		},
	}
	uc := NewScheduleUseCase(&mockTxManager{}, &mockScheduleRepo{}, shiftRepo, userRepo)

	f, err := uc.GenerateTemplate(ctx)
	if err != nil {
		t.Fatalf("GenerateTemplate failed: %v", err)
	}
	defer f.Close()

	// Writing to buffer proves the workbook was NOT prematurely closed by defer f.Close().
	var buf bytes.Buffer
	if _, err := f.WriteTo(&buf); err != nil {
		t.Fatalf("failed to serialize returned template workbook (was it closed?): %v", err)
	}

	reopened, err := excelize.OpenReader(&buf)
	if err != nil {
		t.Fatalf("failed to reopen generated xlsx: %v", err)
	}
	defer reopened.Close()

	uCell, _ := reopened.GetCellValue("DataList", "A1")
	sCell, _ := reopened.GetCellValue("DataList", "B2")
	if uCell != "alice" || sCell != "Shift Malam" {
		t.Fatalf("unexpected DataList values: A1=%q B2=%q", uCell, sCell)
	}

	dvs, err := reopened.GetDataValidations("Import Schedule")
	if err != nil {
		t.Fatalf("GetDataValidations failed: %v", err)
	}
	foundUserDV := false
	foundShiftDV := false
	for _, dv := range dvs {
		if dv.Sqref == "A2:A1000" && dv.Formula1 == "DataList!$A$1:$A$1000" {
			foundUserDV = true
		}
		if dv.Sqref == "C2:C1000" && dv.Formula1 == "DataList!$B$1:$B$1000" {
			foundShiftDV = true
		}
	}
	if !foundUserDV || !foundShiftDV {
		t.Fatalf("expected both username (A2:A1000) and shift (C2:C1000) dropdown validations, got %+v", dvs)
	}
}

func TestScheduleUseCase_CRUDAndProcessImport(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockTxManager{}
	schedRepo := &mockScheduleRepo{}
	userRepo := &mockUserRepo{
		users: []iam_domain.User{makeUser(1, "alice", false)},
	}
	shiftRepo := &mockShiftRepo{
		shifts: []domain.Shift{{BaseEntity: kernel.BaseEntity{ID: 3}, Name: "Regular Pagi"}},
	}
	uc := NewScheduleUseCase(txMgr, schedRepo, shiftRepo, userRepo)

	// Invalid GetSchedules params
	if _, err := uc.GetSchedules(ctx, "abc", "2026-03-01", "2026-03-10"); err == nil {
		t.Fatalf("expected validation error for non-numeric userId")
	}
	if _, err := uc.GetSchedules(ctx, "1", "2026-03-10", "2026-03-01"); !errors.Is(err, domain.ErrInvalidDateRange) {
		t.Fatalf("expected ErrInvalidDateRange, got %v", err)
	}
	list, err := uc.GetSchedules(ctx, "1", "2026-03-01", "2026-03-10")
	if err != nil || list == nil {
		t.Fatalf("expected non-nil empty slice, got list=%v err=%v", list, err)
	}

	// Create & Delete run inside transaction
	if err := uc.CreateSchedule(ctx, hris_dto.CreateScheduleRequest{UserID: 1, ShiftID: 3, Date: "2026-03-05"}, intPtr(99)); err != nil {
		t.Fatalf("CreateSchedule failed: %v", err)
	}
	if err := uc.DeleteSchedule(ctx, "1", "2026-03-05"); err != nil {
		t.Fatalf("DeleteSchedule failed: %v", err)
	}
	if txMgr.calls != 2 {
		t.Fatalf("expected 2 transactions for Create+Delete, got %d", txMgr.calls)
	}

	// Build valid import Excel (Row 1 header, Row 2 example skipped by parser, Row 3+ actual data)
	tmpDir := t.TempDir()
	xlsxPath := filepath.Join(tmpDir, "schedules.xlsx")
	wb := excelize.NewFile()
	_ = wb.SetSheetRow("Sheet1", "A1", &[]any{"Username", "Date", "Shift Name"})
	_ = wb.SetSheetRow("Sheet1", "A2", &[]any{"user_demo", "2026-01-31", "Regular Pagi"})
	_ = wb.SetSheetRow("Sheet1", "A3", &[]any{"alice", "2026-03-06", "Regular Pagi"})
	_ = wb.SetSheetRow("Sheet1", "A4", &[]any{"alice", "2026-03-07", "Regular Pagi"})
	if err := wb.SaveAs(xlsxPath); err != nil {
		t.Fatalf("failed to save temp xlsx: %v", err)
	}
	_ = wb.Close()

	summary, err := uc.ProcessImport(ctx, 10, xlsxPath, 99)
	if err != nil || summary == "" {
		t.Fatalf("ProcessImport failed: %v", err)
	}
	if txMgr.calls != 3 || len(schedRepo.upserts) != 3 { // 1 from CreateSchedule + 2 from import
		t.Fatalf("expected 3 tx calls and 3 total upserts, got tx=%d upserts=%d", txMgr.calls, len(schedRepo.upserts))
	}

	// Unknown user in Excel must fail validation without opening transaction
	badPath := filepath.Join(tmpDir, "bad_schedules.xlsx")
	badWb := excelize.NewFile()
	_ = badWb.SetSheetRow("Sheet1", "A1", &[]any{"Username", "Date", "Shift Name"})
	_ = badWb.SetSheetRow("Sheet1", "A2", &[]any{"user_demo", "2026-01-31", "Regular Pagi"})
	_ = badWb.SetSheetRow("Sheet1", "A3", &[]any{"missing_user", "2026-03-06", "Regular Pagi"})
	_ = badWb.SaveAs(badPath)
	_ = badWb.Close()

	_, err = uc.ProcessImport(ctx, 11, badPath, 99)
	var appErr *apperror.AppError
	if !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected apperror validation error for unknown user, got %v", err)
	}
}

func TestShiftUseCase_CRUDAndGuards(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockTxManager{}
	repo := &mockShiftRepo{
		byID: map[int]*domain.Shift{
			1: {BaseEntity: kernel.BaseEntity{ID: 1}, Name: "Default", StartTime: "08:00:00", EndTime: "16:00:00", WorkDays: "1,2,3,4,5", IsDefault: true},
			2: {BaseEntity: kernel.BaseEntity{ID: 2}, Name: "Night", StartTime: "22:00:00", EndTime: "06:00:00", WorkDays: "1,2,3,4,5", IsDefault: false},
		},
	}
	uc := NewShiftUseCase(txMgr, repo)

	// GetAll non-nil empty slice
	all, err := uc.GetAll(ctx)
	if err != nil || all == nil {
		t.Fatalf("expected non-nil empty slice, got %v / %v", all, err)
	}

	// GetByID NotFound mapping
	if _, err := uc.GetByID(ctx, 999); !errors.Is(err, domain.ErrShiftNotFound) {
		t.Fatalf("expected ErrShiftNotFound, got %v", err)
	}

	// Create rejects duplicate work_days & bad time format
	if _, err := uc.Create(ctx, hris_dto.CreateShiftRequest{
		Name: "Bad", StartTime: "08:00", EndTime: "16:00", WorkDays: "1,1,2",
	}); !errors.Is(err, domain.ErrInvalidWorkDays) {
		t.Fatalf("expected ErrInvalidWorkDays, got %v", err)
	}
	if _, err := uc.Create(ctx, hris_dto.CreateShiftRequest{
		Name: "Bad", StartTime: "25:00", EndTime: "16:00", WorkDays: "1,2,3",
	}); !errors.Is(err, domain.ErrInvalidTimeFormat) {
		t.Fatalf("expected ErrInvalidTimeFormat, got %v", err)
	}

	// Create normalizes HH:mm -> HH:mm:ss and clears default when IsDefault=true
	id, err := uc.Create(ctx, hris_dto.CreateShiftRequest{
		Name: "  Pagi Baru ", StartTime: "08:00", EndTime: "17:00", WorkDays: "1,2,3,4,5", FlexibleMinutes: 15, IsDefault: true,
	})
	if err != nil || id <= 0 {
		t.Fatalf("Create failed: id=%d err=%v", id, err)
	}
	if repo.clearDefaultHits != 1 || repo.created[0].StartTime != "08:00:00" || repo.created[0].EndTime != "17:00:00" || repo.created[0].Name != "Pagi Baru" {
		t.Fatalf("unexpected created shift: clearHits=%d shift=%+v", repo.clearDefaultHits, repo.created[0])
	}

	// Update missing shift -> ErrShiftNotFound
	if err := uc.Update(ctx, 999, hris_dto.UpdateShiftRequest{
		Name: "X", StartTime: "08:00", EndTime: "16:00", WorkDays: "1,2,3",
	}); !errors.Is(err, domain.ErrShiftNotFound) {
		t.Fatalf("expected ErrShiftNotFound on update, got %v", err)
	}

	// Delete default shift -> ErrCannotDeleteDefaultShift
	if err := uc.Delete(ctx, 1); !errors.Is(err, domain.ErrCannotDeleteDefaultShift) {
		t.Fatalf("expected ErrCannotDeleteDefaultShift, got %v", err)
	}
	if len(repo.deletedIDs) != 0 {
		t.Fatalf("default shift must not be deleted")
	}

	// Delete non-default shift succeeds inside transaction
	if err := uc.Delete(ctx, 2); err != nil {
		t.Fatalf("expected non-default shift delete to succeed, got %v", err)
	}
	if len(repo.deletedIDs) != 1 || repo.deletedIDs[0] != 2 {
		t.Fatalf("expected deletedIDs=[2], got %v", repo.deletedIDs)
	}
}
