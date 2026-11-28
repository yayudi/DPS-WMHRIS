package http

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/gin-gonic/gin"
)

type stubReportService struct {
	analytics_port.ReportService
	filtersRes analytics_dto.ReportFilterResponse
	filtersErr error
	jobsRes    []analytics_dto.UserExportJobResponse
	jobsErr    error
}

func (s *stubReportService) GetReportFilters(_ context.Context) (analytics_dto.ReportFilterResponse, error) {
	return s.filtersRes, s.filtersErr
}

func (s *stubReportService) GetUserExportJobs(_ context.Context, _ int) ([]analytics_dto.UserExportJobResponse, error) {
	return s.jobsRes, s.jobsErr
}

type stubJobService struct {
	system_port.JobService
	createdReq  system_dto.CreateExportJobRequest
	createID    int
	createErr   error
	getJobRes   *system_domain.ExportJob
	getJobErr   error
}

func (s *stubJobService) CreateExportJob(_ context.Context, req system_dto.CreateExportJobRequest) (int, error) {
	s.createdReq = req
	return s.createID, s.createErr
}

func (s *stubJobService) GetExportJobByID(_ context.Context, _ int) (*system_domain.ExportJob, error) {
	return s.getJobRes, s.getJobErr
}

type stubStorageService struct {
	system_port.StorageService
	presignedURL string
	presignErr   error
}

func (s *stubStorageService) GeneratePresignedDownloadUrl(_ context.Context, _ string) (string, error) {
	return s.presignedURL, s.presignErr
}

type stubStatisticService struct {
	analytics_port.StatisticService
	breakdownRes []analytics_dto.StockBuildingBreakdownResponse
	breakdownErr error
}

func (s *stubStatisticService) GetStockBuildingBreakdown(_ context.Context, _ int, _, _ string) ([]analytics_dto.StockBuildingBreakdownResponse, error) {
	return s.breakdownRes, s.breakdownErr
}

type stubStatsService struct {
	analytics_port.StatsService
	kpiRes analytics_dto.KpiSummaryResponse
	kpiErr error
}

func (s *stubStatsService) GetKpiSummary(_ context.Context) (analytics_dto.KpiSummaryResponse, error) {
	return s.kpiRes, s.kpiErr
}

func withAuthUser(userID int) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	}
}

func TestReportHandler_RequestStockReport(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("unauthenticated returns 401", func(t *testing.T) {
		h := NewReportHandler(&stubReportService{}, &stubJobService{}, &stubStorageService{})
		r := gin.New()
		r.POST("/reports/stock", h.RequestStockReport)

		req := httptest.NewRequest(http.MethodPost, "/reports/stock", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d body=%s", w.Code, w.Body.String())
		}
	})

	t.Run("null JSON body safely creates export job without nil-map panic", func(t *testing.T) {
		jobSvc := &stubJobService{createID: 77}
		h := NewReportHandler(&stubReportService{}, jobSvc, &stubStorageService{})
		r := gin.New()
		r.POST("/reports/stock", withAuthUser(5), h.RequestStockReport)

		req := httptest.NewRequest(http.MethodPost, "/reports/stock", bytes.NewBufferString("null"))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusAccepted {
			t.Fatalf("expected 202, got %d body=%s", w.Code, w.Body.String())
		}
		if jobSvc.createdReq.UserID != 5 || jobSvc.createdReq.JobType != "STOCK_REPORT" || jobSvc.createdReq.Filters == nil {
			t.Fatalf("unexpected export job request: %+v", jobSvc.createdReq)
		}
		if !strings.Contains(*jobSvc.createdReq.Filters, `"exportType":"STOCK_REPORT"`) {
			t.Fatalf("expected exportType in filters, got %s", *jobSvc.createdReq.Filters)
		}
	})
}

func TestReportHandler_DownloadExportJob(t *testing.T) {
	gin.SetMode(gin.TestMode)
	filePath := "exports/report.xlsx"

	tests := []struct {
		name       string
		authUserID int
		jobRes     *system_domain.ExportJob
		jobErr     error
		presignURL string
		presignErr error
		wantStatus int
	}{
		{
			name:       "unauthenticated returns 401",
			authUserID: 0,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "sql.ErrNoRows returns 404",
			authUserID: 10,
			jobErr:     sql.ErrNoRows,
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "apperror.NotFound returns 404",
			authUserID: 10,
			jobErr:     apperror.NotFound("system.jobs.not_found", "not found"),
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "nil job returns 404",
			authUserID: 10,
			jobRes:     nil,
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "unexpected DB error returns 500 instead of 404",
			authUserID: 10,
			jobErr:     errors.New("db connection reset"),
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:       "cross-user download returns 403",
			authUserID: 10,
			jobRes: &system_domain.ExportJob{
				ImmutableEntity: kernel.ImmutableEntity{ID: 1},
				UserID:          99,
				Status:          "COMPLETED",
				FilePath:        &filePath,
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "incomplete job returns 400",
			authUserID: 10,
			jobRes: &system_domain.ExportJob{
				ImmutableEntity: kernel.ImmutableEntity{ID: 1},
				UserID:          10,
				Status:          "PROCESSING",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "completed owned job redirects 302",
			authUserID: 10,
			jobRes: &system_domain.ExportJob{
				ImmutableEntity: kernel.ImmutableEntity{ID: 1},
				UserID:          10,
				Status:          "COMPLETED",
				FilePath:        &filePath,
			},
			presignURL: "https://storage.example.test/presigned/report.xlsx",
			wantStatus: http.StatusFound,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewReportHandler(
				&stubReportService{},
				&stubJobService{getJobRes: tc.jobRes, getJobErr: tc.jobErr},
				&stubStorageService{presignedURL: tc.presignURL, presignErr: tc.presignErr},
			)
			r := gin.New()
			if tc.authUserID > 0 {
				r.GET("/exports/download/:id", withAuthUser(tc.authUserID), h.DownloadExportJob)
			} else {
				r.GET("/exports/download/:id", h.DownloadExportJob)
			}

			req := httptest.NewRequest(http.MethodGet, "/exports/download/1", nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != tc.wantStatus {
				t.Fatalf("expected %d, got %d body=%s", tc.wantStatus, w.Code, w.Body.String())
			}
			if tc.wantStatus == http.StatusFound && w.Header().Get("Location") != tc.presignURL {
				t.Fatalf("expected Location %q, got %q", tc.presignURL, w.Header().Get("Location"))
			}
		})
	}
}

func TestStatisticHandler_ValidationAndAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	svc := &stubStatisticService{
		breakdownRes: []analytics_dto.StockBuildingBreakdownResponse{
			{Building: "A19", CurrentStock: 25, TotalOut: 5, TotalInbound: 10},
		},
	}
	h := NewStatisticHandler(svc)
	r := gin.New()
	r.POST("/statistics/stock-movements/export", h.RequestStockMovementsExport)
	r.POST("/statistics/location-analysis/export", h.ExportLocationCapacity)
	r.GET("/statistics/package-analysis", h.GetPackageAnalysis)
	r.GET("/statistics/stock-movements/:productId/breakdown", h.GetStockBuildingBreakdown)

	t.Run("export endpoints require authentication", func(t *testing.T) {
		for _, path := range []string{"/statistics/stock-movements/export", "/statistics/location-analysis/export"} {
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("%s: expected 401, got %d", path, w.Code)
			}
		}
	})

	t.Run("package analysis requires startDate and endDate", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/statistics/package-analysis?startDate=2026-01-01", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d body=%s", w.Code, w.Body.String())
		}
	})

	t.Run("building breakdown validates dates and succeeds when valid", func(t *testing.T) {
		reqBad := httptest.NewRequest(http.MethodGet, "/statistics/stock-movements/42/breakdown", nil)
		wBad := httptest.NewRecorder()
		r.ServeHTTP(wBad, reqBad)
		if wBad.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for missing dates, got %d", wBad.Code)
		}

		reqOK := httptest.NewRequest(http.MethodGet, "/statistics/stock-movements/42/breakdown?startDate=2026-01-01&endDate=2026-01-31", nil)
		wOK := httptest.NewRecorder()
		r.ServeHTTP(wOK, reqOK)
		if wOK.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", wOK.Code, wOK.Body.String())
		}
	})
}

func TestStatsHandler_FetchKpiSummary(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("success returns 200 JSON envelope", func(t *testing.T) {
		h := NewStatsHandler(&stubStatsService{
			kpiRes: analytics_dto.KpiSummaryResponse{
				TotalInventoryValue: 125000,
			},
		})
		r := gin.New()
		r.GET("/stats/kpi-summary", h.FetchKpiSummary)

		req := httptest.NewRequest(http.MethodGet, "/stats/kpi-summary", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d body=%s", w.Code, w.Body.String())
		}
		var body struct {
			Success bool                             `json:"success"`
			Data    analytics_dto.KpiSummaryResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("unmarshal response failed: %v", err)
		}
		if !body.Success || body.Data.TotalInventoryValue != 125000 {
			t.Fatalf("unexpected KPI response: %+v", body)
		}
	})

	t.Run("service error returns 500", func(t *testing.T) {
		h := NewStatsHandler(&stubStatsService{kpiErr: errors.New("kpi failed")})
		r := gin.New()
		r.GET("/stats/kpi-summary", h.FetchKpiSummary)

		req := httptest.NewRequest(http.MethodGet, "/stats/kpi-summary", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500, got %d", w.Code)
		}
	})
}
