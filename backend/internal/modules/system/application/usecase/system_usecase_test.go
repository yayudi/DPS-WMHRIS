package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"testing"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

type mockNotificationRepo struct {
	prefsByUser map[int][]system_dto.NotificationPreference
	created     []system_dto.CreateNotificationPayload
}

func (m *mockNotificationRepo) GetRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error) {
	return nil, nil
}
func (m *mockNotificationRepo) GetAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error) {
	return nil, nil
}
func (m *mockNotificationRepo) MarkAsDone(ctx context.Context, notificationID int, userID int) (int, error) {
	return 1, nil
}
func (m *mockNotificationRepo) MarkAllAsDone(ctx context.Context, userID int) (int, error) {
	return 2, nil
}
func (m *mockNotificationRepo) ClaimTask(ctx context.Context, notificationID int, userID int) (int, error) {
	return 1, nil
}
func (m *mockNotificationRepo) GetPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error) {
	return m.prefsByUser[userID], nil
}
func (m *mockNotificationRepo) UpsertPreference(ctx context.Context, userID int, notifType string, isEnabled bool) error {
	return nil
}
func (m *mockNotificationRepo) CreateNotification(ctx context.Context, payload system_dto.CreateNotificationPayload) (int, error) {
	m.created = append(m.created, payload)
	return len(m.created), nil
}

type mockFirebaseSignal struct {
	userSignals   []string
	sharedSignals []string
}

func (m *mockFirebaseSignal) EmitSignal(ctx context.Context, path string, payload map[string]any) error {
	return nil
}
func (m *mockFirebaseSignal) EmitUserSignal(ctx context.Context, userID string, action string) error {
	m.userSignals = append(m.userSignals, userID)
	return nil
}
func (m *mockFirebaseSignal) EmitSharedTaskSignal(ctx context.Context, permission string, action string) error {
	m.sharedSignals = append(m.sharedSignals, permission)
	return nil
}

type mockSystemLogRepo struct {
	lastReq system_dto.GetSystemLogsRequest
	created []*system_domain.SystemLog
}

func (m *mockSystemLogRepo) Create(ctx context.Context, log *system_domain.SystemLog) error {
	m.created = append(m.created, log)
	return nil
}
func (m *mockSystemLogRepo) GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (utils.PaginatedResult[system_dto.SystemLogResponse], error) {
	m.lastReq = req
	return utils.PaginatedResult[system_dto.SystemLogResponse]{Data: []system_dto.SystemLogResponse{}, Total: 0}, nil
}

func TestNotificationService_NoDoubleMarshalAndDeduplication(t *testing.T) {
	repo := &mockNotificationRepo{
		prefsByUser: map[int][]system_dto.NotificationPreference{
			10: {{Type: "WMS", IsEnabled: true}},
			20: {{Type: "WMS", IsEnabled: false}},
		},
	}
	fb := &mockFirebaseSignal{}
	svc := usecase.NewNotificationService(&mockTxManager{}, repo, fb)

	payload := map[string]any{
		"_i18n": map[string]any{"title_key": "notif.stock_low"},
	}

	if err := svc.NotifyUsers(context.Background(), []int{10, 10, 0, -1, 20}, "WMS", "Low Stock", "Check rack", payload, false); err != nil {
		t.Fatalf("NotifyUsers failed: %v", err)
	}
	if len(repo.created) != 1 {
		t.Fatalf("expected 1 notification (deduped user 10, skipped user 20/invalid IDs), got %d", len(repo.created))
	}
	if _, isBytes := repo.created[0].ActionPayload.([]byte); isBytes {
		t.Fatalf("ActionPayload must NOT be pre-marshaled []byte (would double-encode to Base64 in repository)")
	}
	if len(fb.userSignals) != 1 || fb.userSignals[0] != "10" {
		t.Fatalf("expected 1 signal for user 10, got %+v", fb.userSignals)
	}

	if err := svc.NotifyUsersByPermission(context.Background(), "stock.manage", "WMS", "Shared", "Msg", payload, nil, false); err != nil {
		t.Fatalf("NotifyUsersByPermission failed: %v", err)
	}
	if len(repo.created) != 2 {
		t.Fatalf("expected 2 total created notifications, got %d", len(repo.created))
	}
	if _, isBytes := repo.created[1].ActionPayload.([]byte); isBytes {
		t.Fatalf("shared ActionPayload must NOT be pre-marshaled []byte")
	}
}

func TestStorageAndFirebaseSanitization(t *testing.T) {
	if got := usecase.SanitizeStorageFolder("../../exports/./reports\\", "exports"); got != "exports/reports" {
		t.Fatalf("unexpected sanitized folder: %q", got)
	}
	if got := usecase.SanitizeStorageFolder("..", "uploads"); got != "uploads" {
		t.Fatalf("expected fallback uploads, got %q", got)
	}
	if got := usecase.SanitizeStorageFilename(`../../evil"name;drop.xlsx`); got != "evil_name_drop.xlsx" {
		t.Fatalf("unexpected sanitized filename: %q", got)
	}
	if got := usecase.SanitizeFirebasePathSegment("user.1/../../$admin[0]"); got != "user_1________admin_0_" {
		t.Fatalf("unexpected sanitized Firebase key: %q", got)
	}

	// Uninitialized storage client returns clear error without panic
	prevPresign := config.R2PresignClient
	config.R2PresignClient = nil
	t.Cleanup(func() { config.R2PresignClient = prevPresign })

	storageSvc := usecase.NewStorageService()
	if _, _, _, err := storageSvc.GeneratePresignedUploadUrl(context.Background(), "a.png", "image/png", "main"); err == nil {
		t.Fatalf("expected error when R2PresignClient is nil")
	}

	// Uninitialized Firebase returns nil cleanly
	prevFBInit := config.IsFirebaseInitialized
	config.IsFirebaseInitialized = false
	t.Cleanup(func() { config.IsFirebaseInitialized = prevFBInit })

	fbSvc := usecase.NewFirebaseSignalService()
	if err := fbSvc.EmitUserSignal(context.Background(), "42", ""); err != nil {
		t.Fatalf("expected nil error when Firebase is uninitialized, got %v", err)
	}
}

func TestSystemLogService_PaginationClamping(t *testing.T) {
	repo := &mockSystemLogRepo{}
	svc := usecase.NewSystemLogService(repo)

	if _, err := svc.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{Page: 0, Limit: 9999}); err != nil {
		t.Fatalf("GetLogs failed: %v", err)
	}
	if repo.lastReq.Page != 1 || repo.lastReq.Limit != 200 {
		t.Fatalf("expected clamped page=1 limit=200, got page=%d limit=%d", repo.lastReq.Page, repo.lastReq.Limit)
	}
}

type mockNotFoundJobRepo struct {
	mockJobRepo
	lastExportErrMsg *string
}

func (m *mockNotFoundJobRepo) GetImportJobByID(ctx context.Context, id int) (*system_domain.ImportJob, error) {
	return nil, sql.ErrNoRows
}
func (m *mockNotFoundJobRepo) GetExportJobByID(ctx context.Context, id int) (*system_domain.ExportJob, error) {
	for i := range m.exportJobs {
		if m.exportJobs[i].ID == id {
			return &m.exportJobs[i], nil
		}
	}
	return nil, sql.ErrNoRows
}
func (m *mockNotFoundJobRepo) UpdateExportJobStatus(ctx context.Context, id int, status string, filePath *string, errorMessage *string) error {
	m.lastExportErrMsg = errorMessage
	return m.mockJobRepo.UpdateExportJobStatus(ctx, id, status, filePath, errorMessage)
}

func TestJobService_NotFoundAndExportCancelReason(t *testing.T) {
	repo := &mockNotFoundJobRepo{
		mockJobRepo: mockJobRepo{
			exportJobs: []system_domain.ExportJob{
				{ImmutableEntity: kernel.ImmutableEntity{ID: 5}, UserID: 10, Status: system_domain.JobStatusPending},
			},
		},
	}
	svc := usecase.NewJobService(repo)

	// Missing import job returns 404 AppError
	err := svc.CancelImportJob(context.Background(), 999, nil)
	var appErr *apperror.AppError
	if !errors.As(err, &appErr) || appErr.HTTPStatus != http.StatusNotFound {
		t.Fatalf("expected 404 AppError for missing import job, got %v", err)
	}

	// Cancelling own export job records cancellation message
	user10 := 10
	if err := svc.CancelExportJob(context.Background(), 5, &user10); err != nil {
		t.Fatalf("CancelExportJob failed: %v", err)
	}
	if repo.lastExportErrMsg == nil || *repo.lastExportErrMsg == "" {
		t.Fatalf("expected cancellation message recorded in ExportJob.ErrorMessage")
	}
}
