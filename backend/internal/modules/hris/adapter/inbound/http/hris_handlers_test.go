package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	hris_dto "github.com/dps-wmhris/backend/internal/modules/hris/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
)

func init() {
	gin.SetMode(gin.TestMode)
}

type mockAttendanceUseCase struct {
	hris_port.AttendanceUseCase
	rangeResp   *hris_dto.AttendanceRangeResponse
	monthlyErr  error
	updateErr   error
	lastUpdated hris_dto.UpdateLogRequest
}

func (m *mockAttendanceUseCase) GetRangeData(_ context.Context, _, _ string) (*hris_dto.AttendanceRangeResponse, error) {
	return m.rangeResp, nil
}

func (m *mockAttendanceUseCase) GetMonthlyData(_ context.Context, _, _ int) (*hris_dto.AttendanceRangeResponse, error) {
	if m.monthlyErr != nil {
		return nil, m.monthlyErr
	}
	return m.rangeResp, nil
}

func (m *mockAttendanceUseCase) UpdateLog(_ context.Context, req hris_dto.UpdateLogRequest) error {
	m.lastUpdated = req
	return m.updateErr
}

type mockScheduleUseCase struct {
	hris_port.ScheduleUseCase
	createdBy   *int
	createErr   error
	templateWB  *excelize.File
	templateErr error
}

func (m *mockScheduleUseCase) CreateSchedule(_ context.Context, _ hris_dto.CreateScheduleRequest, createdBy *int) error {
	m.createdBy = createdBy
	return m.createErr
}

func (m *mockScheduleUseCase) GenerateTemplate(_ context.Context) (*excelize.File, error) {
	if m.templateErr != nil {
		return nil, m.templateErr
	}
	return m.templateWB, nil
}

type mockShiftUseCase struct {
	hris_port.ShiftUseCase
	getByIDErr error
	shift      *domain.Shift
	deleteErr  error
}

func (m *mockShiftUseCase) GetByID(_ context.Context, _ int) (*domain.Shift, error) {
	if m.getByIDErr != nil {
		return nil, m.getByIDErr
	}
	return m.shift, nil
}

func (m *mockShiftUseCase) Delete(_ context.Context, _ int) error {
	return m.deleteErr
}

type mockJobService struct {
	system_port.JobService
}

func TestAttendanceHandler_ValidationAndAuthGuards(t *testing.T) {
	uc := &mockAttendanceUseCase{
		rangeResp: &hris_dto.AttendanceRangeResponse{
			AllUsers:   []map[string]any{{"id": 1, "username": "alice"}},
			LogRows:    []map[string]any{},
			GlobalInfo: map[string]any{"workDays": 5},
		},
		monthlyErr: domain.ErrInvalidMonthYear,
	}
	handler := NewAttendanceHandler(uc, &mockJobService{})

	r := gin.New()
	r.GET("/attendance/range", handler.GetRangeData)
	r.GET("/attendance/:year/:month", handler.GetMonthlyData)
	r.PUT("/attendance/log", handler.UpdateLog)
	r.POST("/attendance/upload", handler.UploadLogs)

	// 1. Missing required startDate must fail Gin binding validation with 400
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/attendance/range?endDate=2026-03-10", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing startDate, got %d (%s)", w.Code, w.Body.String())
	}

	// 2. Valid range returns raw JSON payload compatible with attendance.api.ts
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/attendance/range?startDate=2026-03-01&endDate=2026-03-10", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid range, got %d", w.Code)
	}
	var raw map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if _, ok := raw["globalInfo"]; !ok {
		t.Fatalf("expected raw response containing globalInfo, got %v", raw)
	}

	// 3. Invalid month maps domain.ErrInvalidMonthYear -> 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/attendance/2026/13", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid month, got %d", w.Code)
	}

	// 4. UpdateLog missing username fails Gin binding with 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/attendance/log", bytes.NewBufferString(`{"date":"2026-03-02"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing username, got %d", w.Code)
	}

	// 5. UploadLogs without authenticated user_id must return 401 before touching disk
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/attendance/upload", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on unauthenticated UploadLogs, got %d", w.Code)
	}
}

func TestScheduleHandler_AuthDownloadAndValidation(t *testing.T) {
	wb := excelize.NewFile()
	_ = wb.SetCellValue("Sheet1", "A1", "Username")
	uc := &mockScheduleUseCase{templateWB: wb}
	handler := NewScheduleHandler(uc, &mockJobService{})

	// 1. Unauthenticated CreateSchedule -> 401
	rUnauth := gin.New()
	rUnauth.POST("/schedules", handler.CreateSchedule)
	rUnauth.POST("/schedules/import", handler.UploadImportSchedule)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/schedules", bytes.NewBufferString(`{"userId":1,"shiftId":2,"date":"2026-03-05"}`))
	req.Header.Set("Content-Type", "application/json")
	rUnauth.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated CreateSchedule, got %d", w.Code)
	}

	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/schedules/import", nil)
	rUnauth.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated UploadImportSchedule, got %d", w.Code)
	}

	// 2. Authenticated routes
	rAuth := gin.New()
	rAuth.Use(func(c *gin.Context) {
		c.Set("user_id", 42)
		c.Next()
	})
	rAuth.POST("/schedules", handler.CreateSchedule)
	rAuth.GET("/schedules/template", handler.DownloadTemplate)

	// Invalid payload (userId=0 violates binding:"required,min=1") -> 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/schedules", bytes.NewBufferString(`{"userId":0,"shiftId":2,"date":"2026-03-05"}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for userId=0, got %d", w.Code)
	}

	// Valid CreateSchedule passes createdBy=42
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/schedules", bytes.NewBufferString(`{"userId":5,"shiftId":2,"date":"2026-03-05"}`))
	req.Header.Set("Content-Type", "application/json")
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusOK || uc.createdBy == nil || *uc.createdBy != 42 {
		t.Fatalf("expected 200 with createdBy=42, got code=%d createdBy=%v", w.Code, uc.createdBy)
	}

	// DownloadTemplate streams valid xlsx bytes and closes workbook cleanly
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/schedules/template", nil)
	rAuth.ServeHTTP(w, req)
	if w.Code != http.StatusOK || w.Body.Len() == 0 {
		t.Fatalf("expected 200 with non-empty xlsx body, got code=%d len=%d", w.Code, w.Body.Len())
	}
	if _, err := excelize.OpenReader(bytes.NewReader(w.Body.Bytes())); err != nil {
		t.Fatalf("streamed template is not a valid xlsx: %v", err)
	}
}

func TestShiftHandler_ErrorMappingAndBinding(t *testing.T) {
	uc := &mockShiftUseCase{}
	handler := NewShiftHandler(uc)

	r := gin.New()
	r.GET("/shifts/:id", handler.GetByID)
	r.POST("/shifts", handler.Create)
	r.DELETE("/shifts/:id", handler.Delete)

	// 1. NotFound domain error -> 404
	uc.getByIDErr = domain.ErrShiftNotFound
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/shifts/99", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for ErrShiftNotFound, got %d", w.Code)
	}

	// 2. Unexpected DB error -> 500 (must NOT be masked as 404)
	uc.getByIDErr = errors.New("connection refused")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/shifts/99", nil))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for unexpected DB error, got %d", w.Code)
	}

	// 3. Create missing required work_days -> 400
	w = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/shifts", bytes.NewBufferString(`{"name":"Pagi","start_time":"08:00","end_time":"16:00"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing work_days, got %d", w.Code)
	}

	// 4. Deleting default shift -> 409 Conflict
	uc.deleteErr = domain.ErrCannotDeleteDefaultShift
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/shifts/1", nil))
	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409 for deleting default shift, got %d", w.Code)
	}
}
