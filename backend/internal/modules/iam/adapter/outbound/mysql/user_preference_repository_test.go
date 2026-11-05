package mysql_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	iam_mysql "github.com/dps-wmhris/backend/internal/modules/iam/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/jmoiron/sqlx"
)

// mockPrefDriver implements database/sql/driver for IAM user_preference testing.
type mockPrefDriver struct {
	mu         sync.Mutex
	queries    []string
	args       [][]driver.Value
	selectRows [][]driver.Value
	selectCols []string
}

var (
	prefDriverInstance *mockPrefDriver
	prefDriverOnce     sync.Once
)

func getMockPrefDriver() *mockPrefDriver {
	prefDriverOnce.Do(func() {
		prefDriverInstance = &mockPrefDriver{}
		sql.Register("mock_user_pref_driver", prefDriverInstance)
	})
	return prefDriverInstance
}

func (d *mockPrefDriver) reset() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.queries = nil
	d.args = nil
	d.selectRows = nil
	d.selectCols = nil
}

func (d *mockPrefDriver) Open(name string) (driver.Conn, error) {
	return &mockPrefConn{driver: d}, nil
}

type mockPrefConn struct {
	driver *mockPrefDriver
}

func (c *mockPrefConn) Prepare(query string) (driver.Stmt, error) {
	return &mockPrefStmt{conn: c, query: query}, nil
}

func (c *mockPrefConn) Close() error { return nil }
func (c *mockPrefConn) Begin() (driver.Tx, error) {
	return &mockPrefTx{}, nil
}

type mockPrefTx struct{}

func (t *mockPrefTx) Commit() error   { return nil }
func (t *mockPrefTx) Rollback() error { return nil }

type mockPrefStmt struct {
	conn  *mockPrefConn
	query string
}

func (s *mockPrefStmt) Close() error { return nil }
func (s *mockPrefStmt) NumInput() int { return -1 }

func (s *mockPrefStmt) Exec(args []driver.Value) (driver.Result, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	return driver.RowsAffected(1), nil
}

func (s *mockPrefStmt) Query(args []driver.Value) (driver.Rows, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	return &mockPrefRows{
		cols: s.conn.driver.selectCols,
		rows: s.conn.driver.selectRows,
	}, nil
}

type mockPrefRows struct {
	cols []string
	rows [][]driver.Value
	idx  int
}

func (r *mockPrefRows) Columns() []string {
	return r.cols
}

func (r *mockPrefRows) Close() error { return nil }

func (r *mockPrefRows) Next(dest []driver.Value) error {
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

func createPrefTestDB(t *testing.T) (*sqlx.DB, *mockPrefDriver) {
	drv := getMockPrefDriver()
	drv.reset()
	rawDB, err := sql.Open("mock_user_pref_driver", "test_pref")
	if err != nil {
		t.Fatalf("failed to open mock sql driver: %v", err)
	}
	db := sqlx.NewDb(rawDB, "mysql")
	return db, drv
}

func TestUserPreferenceRepository_GetByUserID_FoundAndNoRows(t *testing.T) {
	db, drv := createPrefTestDB(t)
	defer db.Close()

	repo := iam_mysql.NewUserPreferenceRepository(db)
	ctx := context.Background()

	// 1. Skenario Row Found
	now := time.Now()
	drv.selectCols = []string{"user_id", "locale", "theme", "timezone", "date_format", "created_at", "updated_at"}
	drv.selectRows = [][]driver.Value{
		{int64(42), "en-US", "dark", "America/New_York", "DD/MM/YYYY", now, now},
	}

	pref, err := repo.GetByUserID(ctx, 42)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pref == nil {
		t.Fatalf("expected non-nil UserPreference")
	}
	if pref.UserID != 42 || pref.Locale != "en-US" || pref.Theme != "dark" || pref.Timezone != "America/New_York" {
		t.Errorf("unexpected field values: %+v", pref)
	}

	// 2. Skenario No Rows (sql.ErrNoRows) -> MUST return (nil, nil) without error
	drv.reset()
	drv.selectCols = []string{"user_id", "locale", "theme", "timezone", "date_format", "created_at", "updated_at"}
	drv.selectRows = [][]driver.Value{} // Empty rows triggers sql.ErrNoRows

	prefNil, err := repo.GetByUserID(ctx, 999)
	if err != nil {
		t.Errorf("expected nil error on sql.ErrNoRows, got: %v", err)
	}
	if prefNil != nil {
		t.Errorf("expected nil preference on no rows, got: %+v", prefNil)
	}
}

func TestUserPreferenceRepository_Upsert(t *testing.T) {
	db, drv := createPrefTestDB(t)
	defer db.Close()

	repo := iam_mysql.NewUserPreferenceRepository(db)
	ctx := context.Background()

	input := &domain.UserPreference{
		UserID:     10,
		Locale:     "en-US",
		Theme:      "dark",
		Timezone:   "Asia/Singapore",
		DateFormat: "DD MMM YYYY",
	}

	err := repo.Upsert(ctx, input)
	if err != nil {
		t.Fatalf("unexpected error during Upsert: %v", err)
	}

	if len(drv.queries) != 1 {
		t.Fatalf("expected 1 INSERT query, got %d", len(drv.queries))
	}

	query := drv.queries[0]
	if !strings.Contains(query, "INSERT INTO user_preferences") || !strings.Contains(query, "ON DUPLICATE KEY UPDATE") {
		t.Errorf("expected upsert query, got: %s", query)
	}

	// Check arguments: user_id, locale, theme, timezone, date_format
	if len(drv.args[0]) != 5 {
		t.Fatalf("expected 5 arguments, got %d", len(drv.args[0]))
	}
	if drv.args[0][0] != int64(10) && drv.args[0][0] != 10 {
		t.Errorf("expected arg[0] to be user_id 10, got %v", drv.args[0][0])
	}
	if drv.args[0][1] != "en-US" {
		t.Errorf("expected arg[1] to be locale 'en-US', got %v", drv.args[0][1])
	}
	if drv.args[0][2] != "dark" {
		t.Errorf("expected arg[2] to be theme 'dark', got %v", drv.args[0][2])
	}
	if drv.args[0][3] != "Asia/Singapore" {
		t.Errorf("expected arg[3] to be timezone 'Asia/Singapore', got %v", drv.args[0][3])
	}
	if drv.args[0][4] != "DD MMM YYYY" {
		t.Errorf("expected arg[4] to be date_format 'DD MMM YYYY', got %v", drv.args[0][4])
	}
}

