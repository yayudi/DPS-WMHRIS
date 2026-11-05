package mysql_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	sys_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/jmoiron/sqlx"
)

// mockLocDriver implements database/sql/driver for zero-dependency in-memory testing.
type mockLocDriver struct {
	mu          sync.Mutex
	queries     []string
	args        [][]driver.Value
	selectRows  [][]driver.Value
	selectCols  []string
	execErr     error
	selectErr   error
	rowsAffect  int64
}

var (
	locDriverInstance *mockLocDriver
	locDriverOnce     sync.Once
)

func getMockLocDriver() *mockLocDriver {
	locDriverOnce.Do(func() {
		locDriverInstance = &mockLocDriver{}
		sql.Register("mock_loc_repo_driver", locDriverInstance)
	})
	return locDriverInstance
}

func (d *mockLocDriver) reset() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.queries = nil
	d.args = nil
	d.selectRows = nil
	d.selectCols = nil
	d.execErr = nil
	d.selectErr = nil
	d.rowsAffect = 1
}

func (d *mockLocDriver) Open(name string) (driver.Conn, error) {
	return &mockLocConn{driver: d}, nil
}

type mockLocConn struct {
	driver *mockLocDriver
}

func (c *mockLocConn) Prepare(query string) (driver.Stmt, error) {
	return &mockLocStmt{conn: c, query: query}, nil
}

func (c *mockLocConn) Close() error { return nil }
func (c *mockLocConn) Begin() (driver.Tx, error) {
	return &mockLocTx{}, nil
}

type mockLocTx struct{}

func (t *mockLocTx) Commit() error   { return nil }
func (t *mockLocTx) Rollback() error { return nil }

type mockLocStmt struct {
	conn  *mockLocConn
	query string
}

func (s *mockLocStmt) Close() error { return nil }
func (s *mockLocStmt) NumInput() int { return -1 }

func (s *mockLocStmt) Exec(args []driver.Value) (driver.Result, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	if s.conn.driver.execErr != nil {
		return nil, s.conn.driver.execErr
	}
	return driver.RowsAffected(s.conn.driver.rowsAffect), nil
}

func (s *mockLocStmt) Query(args []driver.Value) (driver.Rows, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	if s.conn.driver.selectErr != nil {
		return nil, s.conn.driver.selectErr
	}
	return &mockLocRows{
		cols: s.conn.driver.selectCols,
		rows: s.conn.driver.selectRows,
	}, nil
}

type mockLocRows struct {
	cols []string
	rows [][]driver.Value
	idx  int
}

func (r *mockLocRows) Columns() []string {
	return r.cols
}

func (r *mockLocRows) Close() error { return nil }

func (r *mockLocRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.rows) {
		return io.EOF
	}
	row := r.rows[r.idx]
	for i, val := range row {
		dest[i] = val
	}
	r.idx++
	return nil
}

func createTestDB(t *testing.T) (*sqlx.DB, *mockLocDriver) {
	drv := getMockLocDriver()
	drv.reset()
	rawDB, err := sql.Open("mock_loc_repo_driver", "test")
	if err != nil {
		t.Fatalf("failed to open mock sql driver: %v", err)
	}
	db := sqlx.NewDb(rawDB, "mysql")
	return db, drv
}

func TestLocalizationRepository_MetadataTTLCache_ZeroSQLOnRepeatReads(t *testing.T) {
	db, drv := createTestDB(t)
	defer db.Close()

	now := time.Now()
	// Set mock rows for SELECT * FROM localization_locales WHERE is_active = 1
	drv.selectCols = []string{"code", "name", "is_default", "is_active", "version", "updated_at"}
	drv.selectRows = [][]driver.Value{
		{"id-ID", "Bahasa Indonesia", true, true, uint32(1), now},
		{"en-US", "English", false, true, uint32(2), now},
	}

	repo := sys_mysql.NewLocalizationRepository(db)
	ctx := context.Background()

	// 1. First call to GetActiveLocales -> must query database
	locales1, err := repo.GetActiveLocales(ctx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(locales1) != 2 {
		t.Fatalf("expected 2 locales, got %d", len(locales1))
	}
	if len(drv.queries) != 1 {
		t.Fatalf("expected exactly 1 SQL query on cold start, got %d", len(drv.queries))
	}

	// 2. Subsequent calls to GetActiveLocales, GetDefaultLocale, and GetLocaleByCode within 5s TTL
	// MUST be served directly from RAM (ZERO new SQL queries!)
	defLoc, err := repo.GetDefaultLocale(ctx)
	if err != nil || defLoc.Code != "id-ID" {
		t.Fatalf("expected default locale id-ID, got %v", defLoc)
	}
	enLoc, err := repo.GetLocaleByCode(ctx, "en-US")
	if err != nil || enLoc.Code != "en-US" {
		t.Fatalf("expected locale en-US, got %v", enLoc)
	}
	locales2, err := repo.GetActiveLocales(ctx)
	if err != nil || len(locales2) != 2 {
		t.Fatalf("expected cached locales, got %v", locales2)
	}

	// Verify ZERO new SQL queries occurred
	if len(drv.queries) != 1 {
		t.Errorf("expected still exactly 1 SQL query due to in-memory TTL cache, got %d queries", len(drv.queries))
	}

	// 3. InvalidateCache -> resets TTL and flushes dictionary
	repo.InvalidateCache("en-US")

	// Next read should execute a new query to refresh metadata
	_, _ = repo.GetActiveLocales(ctx)
	if len(drv.queries) != 2 {
		t.Errorf("expected 2nd SQL query after cache invalidation, got %d queries", len(drv.queries))
	}
}

func TestLocalizationRepository_UpsertTranslations_BatchChunking500(t *testing.T) {
	db, drv := createTestDB(t)
	defer db.Close()

	repo := sys_mysql.NewLocalizationRepository(db)
	ctx := context.Background()

	// 1. Test empty slice: must be no-op (0 queries)
	err := repo.UpsertTranslations(ctx, "id-ID", nil)
	if err != nil {
		t.Fatalf("unexpected error on nil items: %v", err)
	}
	if len(drv.queries) != 0 {
		t.Errorf("expected 0 queries for nil items, got %d", len(drv.queries))
	}

	// 2. Generate exactly 505 items to verify batchSize = 500 chunking
	totalItems := 505
	items := make([]domain.TranslationItem, totalItems)
	for i := 0; i < totalItems; i++ {
		items[i] = domain.TranslationItem{
			LocaleCode: "en-US",
			Module:     "common",
			Key:        fmt.Sprintf("key_%d", i),
			Value:      fmt.Sprintf("Value %d", i),
		}
	}

	err = repo.UpsertTranslations(ctx, "en-US", items)
	if err != nil {
		t.Fatalf("unexpected error upserting 505 items: %v", err)
	}

	// Should have executed exactly 2 batch queries: Chunk 1 (500 items) + Chunk 2 (5 items)
	if len(drv.queries) != 2 {
		t.Fatalf("expected exactly 2 chunked batch queries for 505 items, got %d", len(drv.queries))
	}

	// Chunk 1 must have 500 * 4 = 2000 arguments
	if len(drv.args[0]) != 2000 {
		t.Errorf("expected 2000 args in 1st chunk, got %d", len(drv.args[0]))
	}

	// Chunk 2 must have 5 * 4 = 20 arguments
	if len(drv.args[1]) != 20 {
		t.Errorf("expected 20 args in 2nd chunk, got %d", len(drv.args[1]))
	}

	// Both queries must have ON DUPLICATE KEY UPDATE
	for i, q := range drv.queries {
		if !strings.Contains(q, "ON DUPLICATE KEY UPDATE") {
			t.Errorf("query #%d missing ON DUPLICATE KEY UPDATE: %s", i, q)
		}
	}
}

func TestLocalizationRepository_DefensiveCopyAndDynamicInvalidation(t *testing.T) {
	db, _ := createTestDB(t)
	defer db.Close()

	repo := sys_mysql.NewLocalizationRepository(db)

	dictEN := &domain.LocalizationDictionary{
		Locale:  "en-US",
		Version: 100002,
		Entries: map[string]string{
			"common.btn.save":   "Save",
			"common.btn.cancel": "Cancel",
		},
	}
	repo.SetCachedDictionary(dictEN)

	// Fetch from cache
	cached, ok := repo.GetCachedDictionary("en-US")
	if !ok || cached == nil {
		t.Fatalf("expected dictionary to be found in cache")
	}

	// External mutation attempt
	cached.Entries["common.btn.save"] = "MUTATED_VALUE"

	// Fetch again: cache internal state MUST be protected by defensive copying!
	cached2, _ := repo.GetCachedDictionary("en-US")
	if cached2.Entries["common.btn.save"] != "Save" {
		t.Errorf("defensive copy failed: internal cache entry was mutated to '%s'", cached2.Entries["common.btn.save"])
	}

	// Test selective vs global invalidation
	dictID := &domain.LocalizationDictionary{
		Locale:  "id-ID",
		Version: 1,
		Entries: map[string]string{"common.btn.save": "Simpan"},
	}
	repo.SetCachedDictionary(dictID)

	// Invalidating non-default "en-US" only removes "en-US"
	repo.InvalidateCache("en-US")
	if _, exists := repo.GetCachedDictionary("en-US"); exists {
		t.Errorf("expected en-US to be invalidated")
	}
	if _, exists := repo.GetCachedDictionary("id-ID"); !exists {
		t.Errorf("expected id-ID to still remain in cache")
	}

	// Invalidating default "id-ID" flushes all caches
	repo.SetCachedDictionary(dictEN)
	repo.InvalidateCache("id-ID")
	if _, exists := repo.GetCachedDictionary("id-ID"); exists {
		t.Errorf("expected id-ID to be flushed on global invalidation")
	}
	if _, exists := repo.GetCachedDictionary("en-US"); exists {
		t.Errorf("expected en-US to be flushed on global invalidation")
	}
}

func TestLocalizationRepository_IncrementVersion(t *testing.T) {
	db, drv := createTestDB(t)
	defer db.Close()

	// Mock SELECT version query result after UPDATE
	drv.selectCols = []string{"version"}
	drv.selectRows = [][]driver.Value{
		{uint32(3)},
	}

	repo := sys_mysql.NewLocalizationRepository(db)
	ctx := context.Background()

	newVer, err := repo.IncrementVersion(ctx, "en-US")
	if err != nil {
		t.Fatalf("unexpected error incrementing version: %v", err)
	}
	if newVer != 3 {
		t.Errorf("expected new version 3, got %d", newVer)
	}

	// Verify UPDATE query executed
	if len(drv.queries) < 2 {
		t.Fatalf("expected at least 2 queries (UPDATE + SELECT), got %d", len(drv.queries))
	}
	if !strings.Contains(drv.queries[0], "UPDATE localization_locales SET version = version + 1") {
		t.Errorf("expected UPDATE query, got: %s", drv.queries[0])
	}
}

