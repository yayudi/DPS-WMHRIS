package http_test

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	system_http "github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/http"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/dps-wmhris/backend/internal/shared/utils"
	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/xuri/excelize/v2"
)

type stubMediaService struct {
	saveBatchErr  error
	deleteErr     error
	getByIDsErr   error
	getAssetsFunc func(ctx context.Context, page, limit int, filter system_dto.MediaFilter) (utils.PaginatedResult[system_dto.MediaAssetResponse], error)
}

func (s *stubMediaService) SaveMediaMetadata(ctx context.Context, asset system_dto.ConfirmUploadAsset, userID int) (int, error) {
	return 1, nil
}
func (s *stubMediaService) SaveMediaBatch(ctx context.Context, assets []system_dto.ConfirmUploadAsset, products any, userID int) ([]map[string]any, error) {
	if s.saveBatchErr != nil {
		return nil, s.saveBatchErr
	}
	return []map[string]any{{"id": 1}}, nil
}
func (s *stubMediaService) DeleteMediaAndQueueTrash(ctx context.Context, mediaID int) error {
	return s.deleteErr
}
func (s *stubMediaService) GetMediaAssets(ctx context.Context, page, limit int, filter system_dto.MediaFilter) (utils.PaginatedResult[system_dto.MediaAssetResponse], error) {
	if s.getAssetsFunc != nil {
		return s.getAssetsFunc(ctx, page, limit, filter)
	}
	return utils.PaginatedResult[system_dto.MediaAssetResponse]{Data: []system_dto.MediaAssetResponse{}, Page: page, Limit: limit}, nil
}
func (s *stubMediaService) GetMediaDetailsWithProducts(ctx context.Context, mediaID int) (*system_dto.MediaAssetResponse, error) {
	return nil, nil
}
func (s *stubMediaService) GetMediaAssetsByIDs(ctx context.Context, mediaIDs []int) ([]system_dto.MediaAssetResponse, error) {
	if s.getByIDsErr != nil {
		return nil, s.getByIDsErr
	}
	return []system_dto.MediaAssetResponse{}, nil
}
func (s *stubMediaService) DeleteMediaAsset(ctx context.Context, mediaID int) (string, string, error) {
	return "", "", nil
}
func (s *stubMediaService) InsertTrashQueue(ctx context.Context, r2Key string) error { return nil }
func (s *stubMediaService) UpdateMediaTags(ctx context.Context, mediaID int, tags []string) error {
	return nil
}
func (s *stubMediaService) UpdateMediaTitle(ctx context.Context, mediaID int, title string) error {
	return nil
}
func (s *stubMediaService) ProcessMediaLinkImport(ctx context.Context, filePath string, userID int) (string, error) {
	return "", nil
}
func (s *stubMediaService) GenerateBulkLinkTemplate() *excelize.File { return excelize.NewFile() }

type stubStorageService struct {
	presignErr error
}

func (s *stubStorageService) GeneratePresignedUploadUrl(ctx context.Context, originalName, mimeType, folder string) (string, string, string, error) {
	if s.presignErr != nil {
		return "", "", "", s.presignErr
	}
	return "https://r2.test/put", folder + "/" + originalName, "https://cdn.test/" + folder + "/" + originalName, nil
}
func (s *stubStorageService) DeleteFromR2(ctx context.Context, key string) (bool, error) {
	return true, nil
}
func (s *stubStorageService) UploadFile(ctx context.Context, fileContent []byte, originalName, mimeType, folder string) (string, error) {
	return folder + "/" + originalName, nil
}
func (s *stubStorageService) GeneratePresignedDownloadUrl(ctx context.Context, r2Key string) (string, error) {
	return "https://r2.test/get", nil
}

type stubJobService struct {
	lastUserID *int
	cancelErr  error
}

func (s *stubJobService) CreateImportJob(ctx context.Context, req system_dto.CreateImportJobRequest) (int, error) {
	return 1, nil
}
func (s *stubJobService) GetImportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[domain.ImportJob], error) {
	s.lastUserID = userID
	return utils.PaginatedResult[domain.ImportJob]{Data: []domain.ImportJob{}, Page: page, Limit: limit}, nil
}
func (s *stubJobService) CancelImportJob(ctx context.Context, id int, userID *int) error {
	s.lastUserID = userID
	return s.cancelErr
}
func (s *stubJobService) UpdateImportJobStatus(ctx context.Context, id int, status string) error {
	return nil
}
func (s *stubJobService) UpdateImportJobStatusWithSummary(ctx context.Context, id int, status string, logSummary string) error {
	return nil
}
func (s *stubJobService) UpdateImportJobStatusWithLog(ctx context.Context, id int, status string, logSummary string, errorLog string) error {
	return nil
}
func (s *stubJobService) UpdateImportJobProgress(ctx context.Context, id int, processed int, total int) error {
	return nil
}
func (s *stubJobService) CreateExportJob(ctx context.Context, req system_dto.CreateExportJobRequest) (int, error) {
	return 1, nil
}
func (s *stubJobService) GetExportJobs(ctx context.Context, page int, limit int, userID *int) (utils.PaginatedResult[domain.ExportJob], error) {
	s.lastUserID = userID
	return utils.PaginatedResult[domain.ExportJob]{Data: []domain.ExportJob{}, Page: page, Limit: limit}, nil
}
func (s *stubJobService) GetExportJobByID(ctx context.Context, id int) (*domain.ExportJob, error) {
	return nil, nil
}
func (s *stubJobService) CancelExportJob(ctx context.Context, id int, userID *int) error {
	s.lastUserID = userID
	return s.cancelErr
}
func (s *stubJobService) UpdateExportJobStatus(ctx context.Context, id int, status string, fileURL *string, errorLog *string) error {
	return nil
}

type stubNotificationService struct {
	claimOK bool
}

func (s *stubNotificationService) FetchRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error) {
	return []system_dto.NotificationResponse{}, nil
}
func (s *stubNotificationService) FetchAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error) {
	return []system_dto.NotificationResponse{}, nil
}
func (s *stubNotificationService) MarkNotificationAsDone(ctx context.Context, notificationID int, userID int) error {
	return nil
}
func (s *stubNotificationService) MarkAllNotificationsAsDone(ctx context.Context, userID int) error {
	return nil
}
func (s *stubNotificationService) ClaimNotification(ctx context.Context, notificationID int, userID int) (bool, error) {
	return s.claimOK, nil
}
func (s *stubNotificationService) FetchPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error) {
	return []system_dto.NotificationPreference{}, nil
}
func (s *stubNotificationService) UpdatePreferences(ctx context.Context, userID int, preferences []system_dto.NotificationPreference) error {
	return nil
}
func (s *stubNotificationService) NotifyUsers(ctx context.Context, userIDs []int, notifType, title, message string, actionPayload any, isDone bool) error {
	return nil
}
func (s *stubNotificationService) NotifyUsersByPermission(ctx context.Context, permissionName, notifType, title, message string, actionPayload any, excludeUserID *int, isDone bool) error {
	return nil
}

type stubSystemLogService struct{}

func (s *stubSystemLogService) CreateLog(ctx context.Context, req system_dto.CreateLogRequest) error {
	return nil
}
func (s *stubSystemLogService) GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (*system_dto.GetSystemLogsResponse, error) {
	return &system_dto.GetSystemLogsResponse{Data: []system_dto.SystemLogResponse{}, Total: 12}, nil
}

func TestMediaHandler_ErrorMaskingPresignAndFKConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	mediaSvc := &stubMediaService{
		getByIDsErr: errors.New("Error 1054: secret_sql_column_name"),
	}
	storageSvc := &stubStorageService{
		presignErr: errors.New("R2 credentials missing"),
	}
	handler := system_http.NewMediaHandler(mediaSvc, storageSvc, &stubJobService{})

	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, 5)
		c.Next()
	})
	r.GET("/media/status", handler.GetMediaStatus)
	r.POST("/media/presigned-url", handler.GetPresignedUrls)
	r.POST("/media/confirm", handler.ConfirmUpload)
	r.DELETE("/media/:id", handler.DeleteMedia)

	// 1. GetMediaStatus masks internal SQL error (CWE-209)
	reqStatus, _ := http.NewRequest(http.MethodGet, "/media/status?ids=1,2", nil)
	wStatus := httptest.NewRecorder()
	r.ServeHTTP(wStatus, reqStatus)
	if wStatus.Code != http.StatusInternalServerError || strings.Contains(wStatus.Body.String(), "secret_sql_column_name") {
		t.Fatalf("expected 500 with masked error, got %d: %s", wStatus.Code, wStatus.Body.String())
	}

	// 2. GetPresignedUrls returns 500 STORAGE_ERROR when storage fails (not 200 empty URLs)
	reqPresign, _ := http.NewRequest(http.MethodPost, "/media/presigned-url", bytes.NewBufferString(`{"files":[{"name":"a.png","type":"image/png"}]}`))
	reqPresign.Header.Set("Content-Type", "application/json")
	wPresign := httptest.NewRecorder()
	r.ServeHTTP(wPresign, reqPresign)
	if wPresign.Code != http.StatusInternalServerError || !strings.Contains(wPresign.Body.String(), "STORAGE_ERROR") {
		t.Fatalf("expected 500 STORAGE_ERROR, got %d: %s", wPresign.Code, wPresign.Body.String())
	}

	// 3. ConfirmUpload maps DuplicateMediaError via errors.As -> 409 DUPLICATE_MEDIA
	mediaSvc.saveBatchErr = domain.DuplicateMediaError{DuplicateOf: 88}
	reqDup, _ := http.NewRequest(http.MethodPost, "/media/confirm", bytes.NewBufferString(`{"assets":[{"title":"a","mainPath":"main/a.png"}]}`))
	reqDup.Header.Set("Content-Type", "application/json")
	wDup := httptest.NewRecorder()
	r.ServeHTTP(wDup, reqDup)
	if wDup.Code != http.StatusConflict || !strings.Contains(wDup.Body.String(), "DUPLICATE_MEDIA") {
		t.Fatalf("expected 409 DUPLICATE_MEDIA, got %d: %s", wDup.Code, wDup.Body.String())
	}

	// 4. DeleteMedia maps MySQL 1451 FK violation -> 409 CONFLICT
	mediaSvc.deleteErr = &mysql.MySQLError{Number: 1451, Message: "Cannot delete or update a parent row"}
	reqDelFK, _ := http.NewRequest(http.MethodDelete, "/media/12", nil)
	wDelFK := httptest.NewRecorder()
	r.ServeHTTP(wDelFK, reqDelFK)
	if wDelFK.Code != http.StatusConflict || !strings.Contains(wDelFK.Body.String(), "CONFLICT") {
		t.Fatalf("expected 409 CONFLICT on FK violation, got %d: %s", wDelFK.Code, wDelFK.Body.String())
	}

	// 5. DeleteMedia maps NotFound AppError -> 404
	mediaSvc.deleteErr = apperror.NotFound("settings.media.asset_not_found", "aset tidak ditemukan")
	reqDelNF, _ := http.NewRequest(http.MethodDelete, "/media/999", nil)
	wDelNF := httptest.NewRecorder()
	r.ServeHTTP(wDelNF, reqDelNF)
	if wDelNF.Code != http.StatusNotFound {
		t.Fatalf("expected 404 NotFound, got %d", wDelNF.Code)
	}
}

func TestJobNotificationLogAndUploadHandlers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jobSvc := &stubJobService{}
	jobHandler := system_http.NewJobHandler(jobSvc)
	notifHandler := system_http.NewNotificationHandler(&stubNotificationService{claimOK: false})
	logHandler := system_http.NewSystemLogHandler(&stubSystemLogService{})
	uploadHandler := system_http.NewUploadHandler(&stubStorageService{})

	// 1. Unauthenticated endpoints return 401
	rUnauth := gin.New()
	rUnauth.GET("/jobs/import", jobHandler.GetImportJobs)
	rUnauth.GET("/notifications/recent", notifHandler.GetRecentPending)
	rUnauth.POST("/upload/presigned-url", uploadHandler.GetPresignedUrl)

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/jobs/import"},
		{http.MethodGet, "/notifications/recent"},
		{http.MethodPost, "/upload/presigned-url"},
	} {
		req, _ := http.NewRequest(tc.method, tc.path, bytes.NewBufferString(`{}`))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		rUnauth.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s expected 401 without auth, got %d", tc.method, tc.path, w.Code)
		}
	}

	// 2. Authenticated handlers
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, 33)
		c.Next()
	})
	r.GET("/jobs/import", jobHandler.GetImportJobs)
	r.PUT("/notifications/:id/claim", notifHandler.ClaimNotification)
	r.GET("/logs", logHandler.GetLogs)
	r.POST("/upload/presigned-url", uploadHandler.GetPresignedUrl)

	reqJobs, _ := http.NewRequest(http.MethodGet, "/jobs/import", nil)
	wJobs := httptest.NewRecorder()
	r.ServeHTTP(wJobs, reqJobs)
	if wJobs.Code != http.StatusOK || jobSvc.lastUserID == nil || *jobSvc.lastUserID != 33 {
		t.Fatalf("expected 200 scoped to user 33, got code=%d userID=%v", wJobs.Code, jobSvc.lastUserID)
	}

	reqClaim, _ := http.NewRequest(http.MethodPut, "/notifications/5/claim", nil)
	wClaim := httptest.NewRecorder()
	r.ServeHTTP(wClaim, reqClaim)
	if wClaim.Code != http.StatusConflict || !strings.Contains(wClaim.Body.String(), "CONFLICT") {
		t.Fatalf("expected 409 CONFLICT when claim fails, got %d: %s", wClaim.Code, wClaim.Body.String())
	}

	reqLogs, _ := http.NewRequest(http.MethodGet, "/logs?page=1&limit=10", nil)
	wLogs := httptest.NewRecorder()
	r.ServeHTTP(wLogs, reqLogs)
	if wLogs.Code != http.StatusOK || !strings.Contains(wLogs.Body.String(), `"total":12`) {
		t.Fatalf("expected 200 with top-level total=12, got %d: %s", wLogs.Code, wLogs.Body.String())
	}

	reqUpload, _ := http.NewRequest(http.MethodPost, "/upload/presigned-url", bytes.NewBufferString(`{"fileName":"doc.pdf","mimeType":"application/pdf","folder":"docs"}`))
	reqUpload.Header.Set("Content-Type", "application/json")
	wUpload := httptest.NewRecorder()
	r.ServeHTTP(wUpload, reqUpload)
	if wUpload.Code != http.StatusOK || !strings.Contains(wUpload.Body.String(), `"publicUrl"`) {
		t.Fatalf("expected 200 with presigned URL data, got %d: %s", wUpload.Code, wUpload.Body.String())
	}
}
