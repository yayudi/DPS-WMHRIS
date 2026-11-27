package mysql_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	sys_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/jmoiron/sqlx"
)

type mockSysDriver struct {
	mu         sync.Mutex
	queries    []string
	args       [][]driver.Value
	selectCols []string
	selectRows [][]driver.Value
	selectErr  error
}

var (
	sysDriverInstance *mockSysDriver
	sysDriverOnce     sync.Once
)

func getMockSysDriver() *mockSysDriver {
	sysDriverOnce.Do(func() {
		sysDriverInstance = &mockSysDriver{}
		sql.Register("mock_sys_repo_driver", sysDriverInstance)
	})
	return sysDriverInstance
}

func (d *mockSysDriver) reset() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.queries = nil
	d.args = nil
	d.selectCols = nil
	d.selectRows = nil
	d.selectErr = nil
}

func (d *mockSysDriver) Open(string) (driver.Conn, error) {
	return &mockSysConn{driver: d}, nil
}

type mockSysConn struct{ driver *mockSysDriver }

func (c *mockSysConn) Prepare(query string) (driver.Stmt, error) {
	return &mockSysStmt{conn: c, query: query}, nil
}
func (c *mockSysConn) Close() error              { return nil }
func (c *mockSysConn) Begin() (driver.Tx, error) { return &mockSysTx{}, nil }

type mockSysTx struct{}

func (t *mockSysTx) Commit() error   { return nil }
func (t *mockSysTx) Rollback() error { return nil }

type mockSysStmt struct {
	conn  *mockSysConn
	query string
}

func (s *mockSysStmt) Close() error  { return nil }
func (s *mockSysStmt) NumInput() int { return -1 }

type mockSysResult struct {
	lastID int64
	rows   int64
}

func (r mockSysResult) LastInsertId() (int64, error) { return r.lastID, nil }
func (r mockSysResult) RowsAffected() (int64, error) { return r.rows, nil }

func (s *mockSysStmt) Exec(args []driver.Value) (driver.Result, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	return mockSysResult{lastID: 1, rows: 1}, nil
}

func (s *mockSysStmt) Query(args []driver.Value) (driver.Rows, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	if s.conn.driver.selectErr != nil {
		return nil, s.conn.driver.selectErr
	}
	return &mockSysRows{cols: s.conn.driver.selectCols, rows: s.conn.driver.selectRows}, nil
}

type mockSysRows struct {
	cols []string
	rows [][]driver.Value
	idx  int
}

func (r *mockSysRows) Columns() []string { return r.cols }
func (r *mockSysRows) Close() error      { return nil }
func (r *mockSysRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.rows) {
		return io.EOF
	}
	copy(dest, r.rows[r.idx])
	r.idx++
	return nil
}

func createSysTestDB(t *testing.T) (*sqlx.DB, *mockSysDriver) {
	t.Helper()
	drv := getMockSysDriver()
	drv.reset()
	rawDB, err := sql.Open("mock_sys_repo_driver", "test")
	if err != nil {
		t.Fatalf("failed to open mock sys driver: %v", err)
	}
	return sqlx.NewDb(rawDB, "mysql"), drv
}

func TestJobRepository_ClaimUpdatesStatusInMemory(t *testing.T) {
	db, drv := createSysTestDB(t)
	defer db.Close()

	now := time.Now()
	drv.selectCols = []string{"id", "user_id", "job_type", "file_path", "status", "created_at", "updated_at"}
	drv.selectRows = [][]driver.Value{
		{int64(9), int64(3), "ADJUST_STOCK", "/tmp/a.xlsx", domain.JobStatusPending, now, now},
	}

	repo := sys_mysql.NewJobRepository(db)
	job, err := repo.ClaimNextImportJob(context.Background())
	if err != nil {
		t.Fatalf("ClaimNextImportJob failed: %v", err)
	}
	if job == nil || job.Status != domain.JobStatusProcessing {
		t.Fatalf("expected claimed job status PROCESSING, got %+v", job)
	}
}

func TestMediaRepository_GetByIDDeleteAndHashErrors(t *testing.T) {
	db, drv := createSysTestDB(t)
	defer db.Close()

	now := time.Now().Format(time.RFC3339)
	drv.selectCols = []string{"id", "title", "main_path", "thumbnail_path", "status", "uploader_id", "tags", "hash", "duplicate_of", "size_bytes", "width", "height", "created_at", "updated_at"}
	drv.selectRows = [][]driver.Value{
		{int64(4), "Photo", "main/p.webp", nil, "COMPLETED", int64(1), nil, "abc", nil, int64(100), int64(10), int64(10), now, now},
	}

	repo := sys_mysql.NewMediaRepository(db)
	asset, err := repo.GetMediaAssetByID(context.Background(), 4)
	if err != nil || asset == nil || asset.ID != 4 {
		t.Fatalf("GetMediaAssetByID failed: asset=%+v err=%v", asset, err)
	}
	if strings.Contains(drv.queries[0], "usage_count") || strings.Contains(drv.queries[0], "linked_products") {
		t.Fatalf("GetMediaAssetByID must not select virtual subquery columns: %s", drv.queries[0])
	}

	if err := repo.DeleteMediaAsset(context.Background(), 4); err != nil {
		t.Fatalf("DeleteMediaAsset failed: %v", err)
	}
	if !strings.Contains(drv.queries[1], "DELETE FROM media_assets WHERE id = ?") {
		t.Fatalf("expected hard DELETE on media_assets, got: %s", drv.queries[1])
	}

	// GetMediaAssetByHash propagates real DB errors (instead of swallowing them as nil)
	drv.selectErr = errors.New("connection refused")
	if _, err := repo.GetMediaAssetByHash(context.Background(), "abc"); err == nil {
		t.Fatalf("expected DB error to propagate from GetMediaAssetByHash")
	}
}

func TestNotificationRepository_CreateNotification_NoBase64DoubleEncode(t *testing.T) {
	db, drv := createSysTestDB(t)
	defer db.Close()

	repo := sys_mysql.NewNotificationRepository(db)
	uid := 10
	_, err := repo.CreateNotification(context.Background(), system_dto.CreateNotificationPayload{
		UserID:  &uid,
		Type:    "WMS",
		Title:   "Alert",
		Message: "Low stock",
		ActionPayload: map[string]any{
			"_i18n": map[string]any{"title_key": "notif.low"},
		},
	})
	if err != nil {
		t.Fatalf("CreateNotification failed: %v", err)
	}
	if len(drv.args) != 1 || len(drv.args[0]) < 5 {
		t.Fatalf("expected INSERT args captured, got %+v", drv.args)
	}
	stored, ok := drv.args[0][4].(string)
	if !ok || !strings.HasPrefix(stored, `{"_i18n":`) {
		t.Fatalf("expected JSON object string in action_payload, got %#v", drv.args[0][4])
	}
}

func TestSettingRepository_AndSystemLogDateValidation(t *testing.T) {
	db, drv := createSysTestDB(t)
	defer db.Close()

	// Empty rows -> sql.ErrNoRows -> GetSettingByKey returns (nil, nil)
	drv.selectCols = []string{"id", "setting_key", "setting_name", "value_str", "value_int", "description", "updated_at"}
	drv.selectRows = nil
	settingRepo := sys_mysql.NewSettingRepository(db)
	got, err := settingRepo.GetSettingByKey(context.Background(), "nonexistent")
	if err != nil || got != nil {
		t.Fatalf("expected (nil, nil) on missing setting, got (%+v, %v)", got, err)
	}

	// SystemLogRepository ignores malformed dates while accepting YYYY-MM-DD
	logDB, logDrv := createLogTestDB(t)
	defer logDB.Close()
	logRepo := sys_mysql.NewSystemLogRepository(logDB)
	_, err = logRepo.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{
		Page:      1,
		Limit:     20,
		StartDate: "2026-11-01",
		EndDate:   "not-a-date; DROP TABLE users",
	})
	if err != nil {
		t.Fatalf("GetLogs failed: %v", err)
	}
	sqlStr := logDrv.queries[0]
	if !strings.Contains(sqlStr, "l.created_at >= ?") {
		t.Errorf("expected valid StartDate filter in SQL: %s", sqlStr)
	}
	if strings.Contains(sqlStr, "l.created_at <= ?") {
		t.Errorf("expected malformed EndDate to be ignored, got SQL: %s", sqlStr)
	}
}
