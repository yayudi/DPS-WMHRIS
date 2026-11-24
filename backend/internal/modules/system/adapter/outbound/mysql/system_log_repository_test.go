package mysql_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"io"
	"strings"
	"sync"
	"testing"

	sys_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/jmoiron/sqlx"
)

type mockLogDriver struct {
	mu      sync.Mutex
	queries []string
	args    [][]driver.Value
}

var (
	logDriverInstance *mockLogDriver
	logDriverOnce     sync.Once
)

func getMockLogDriver() *mockLogDriver {
	logDriverOnce.Do(func() {
		logDriverInstance = &mockLogDriver{}
		sql.Register("mock_log_repo_driver", logDriverInstance)
	})
	return logDriverInstance
}

func (d *mockLogDriver) reset() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.queries = nil
	d.args = nil
}

func (d *mockLogDriver) Open(string) (driver.Conn, error) {
	return &mockLogConn{driver: d}, nil
}

type mockLogConn struct {
	driver *mockLogDriver
}

func (c *mockLogConn) Prepare(query string) (driver.Stmt, error) {
	return &mockLogStmt{conn: c, query: query}, nil
}
func (c *mockLogConn) Close() error              { return nil }
func (c *mockLogConn) Begin() (driver.Tx, error) { return &mockLogTx{}, nil }

type mockLogTx struct{}

func (t *mockLogTx) Commit() error   { return nil }
func (t *mockLogTx) Rollback() error { return nil }

type mockLogStmt struct {
	conn  *mockLogConn
	query string
}

func (s *mockLogStmt) Close() error  { return nil }
func (s *mockLogStmt) NumInput() int { return -1 }

func (s *mockLogStmt) Exec(args []driver.Value) (driver.Result, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	return driver.RowsAffected(1), nil
}

func (s *mockLogStmt) Query(args []driver.Value) (driver.Rows, error) {
	s.conn.driver.mu.Lock()
	defer s.conn.driver.mu.Unlock()
	s.conn.driver.queries = append(s.conn.driver.queries, s.query)
	s.conn.driver.args = append(s.conn.driver.args, args)
	return &mockLogCountRows{}, nil
}

type mockLogCountRows struct {
	done bool
}

func (r *mockLogCountRows) Columns() []string { return []string{"COUNT(*)"} }
func (r *mockLogCountRows) Close() error      { return nil }
func (r *mockLogCountRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	dest[0] = int64(0)
	r.done = true
	return nil
}

func createLogTestDB(t *testing.T) (*sqlx.DB, *mockLogDriver) {
	t.Helper()
	drv := getMockLogDriver()
	drv.reset()
	rawDB, err := sql.Open("mock_log_repo_driver", "test")
	if err != nil {
		t.Fatalf("failed to open mock log driver: %v", err)
	}
	return sqlx.NewDb(rawDB, "mysql"), drv
}

func TestSystemLogRepository_GetLogs_TriStateFilter(t *testing.T) {
	t.Run("applies JSON TriState include and exclude for action and targetType", func(t *testing.T) {
		db, drv := createLogTestDB(t)
		defer db.Close()

		repo := sys_mysql.NewSystemLogRepository(db)
		_, err := repo.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{
			Page:       1,
			Limit:      20,
			Action:     `{"include":["CREATE","UPDATE"],"exclude":["LOGIN"]}`,
			TargetType: `{"include":["PRODUCT"],"exclude":["USER"]}`,
		})
		if err != nil {
			t.Fatalf("unexpected GetLogs error: %v", err)
		}

		if len(drv.queries) == 0 {
			t.Fatal("expected SQL count query to execute")
		}
		sqlStr := drv.queries[0]
		if !strings.Contains(sqlStr, "l.action IN (?, ?)") {
			t.Errorf("expected SQL to contain l.action IN (?, ?), got: %s", sqlStr)
		}
		if !strings.Contains(sqlStr, "l.action NOT IN (?)") {
			t.Errorf("expected SQL to contain l.action NOT IN (?), got: %s", sqlStr)
		}
		if !strings.Contains(sqlStr, "l.target_type IN (?)") {
			t.Errorf("expected SQL to contain l.target_type IN (?), got: %s", sqlStr)
		}
		if !strings.Contains(sqlStr, "l.target_type NOT IN (?)") {
			t.Errorf("expected SQL to contain l.target_type NOT IN (?), got: %s", sqlStr)
		}

		expectedArgs := []driver.Value{"CREATE", "UPDATE", "LOGIN", "PRODUCT", "USER"}
		if len(drv.args[0]) != len(expectedArgs) {
			t.Fatalf("expected args %v, got %v", expectedArgs, drv.args[0])
		}
		for i, want := range expectedArgs {
			if drv.args[0][i] != want {
				t.Errorf("arg[%d]: want %v, got %v", i, want, drv.args[0][i])
			}
		}
	})

	t.Run("ignores empty TriState JSON object cleanly", func(t *testing.T) {
		db, drv := createLogTestDB(t)
		defer db.Close()

		repo := sys_mysql.NewSystemLogRepository(db)
		_, err := repo.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{
			Page:       1,
			Limit:      20,
			Action:     `{"include":[],"exclude":[]}`,
			TargetType: `{"include":[],"exclude":[]}`,
		})
		if err != nil {
			t.Fatalf("unexpected GetLogs error: %v", err)
		}

		sqlStr := drv.queries[0]
		if strings.Contains(sqlStr, "l.action") || strings.Contains(sqlStr, "l.target_type") {
			// Ensure WHERE does not filter by l.action / l.target_type (only SELECT/CASE references l.target_type)
			whereIdx := strings.Index(sqlStr, "WHERE ")
			if whereIdx >= 0 && (strings.Contains(sqlStr[whereIdx:], "l.action") || strings.Contains(sqlStr[whereIdx:], "l.target_type")) {
				t.Errorf("expected empty TriState to add no WHERE condition, got WHERE: %s", sqlStr[whereIdx:])
			}
		}
	})

	t.Run("supports comma-separated and single value fallbacks", func(t *testing.T) {
		db, drv := createLogTestDB(t)
		defer db.Close()

		repo := sys_mysql.NewSystemLogRepository(db)
		_, err := repo.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{
			Page:       1,
			Limit:      20,
			Action:     "CREATE, UPDATE",
			TargetType: "PRODUCT",
		})
		if err != nil {
			t.Fatalf("unexpected GetLogs error: %v", err)
		}

		sqlStr := drv.queries[0]
		if !strings.Contains(sqlStr, "l.action IN (?, ?)") {
			t.Errorf("expected SQL to contain l.action IN (?, ?), got: %s", sqlStr)
		}
		if !strings.Contains(sqlStr, "l.target_type = ?") {
			t.Errorf("expected SQL to contain l.target_type = ?, got: %s", sqlStr)
		}
		expectedArgs := []driver.Value{"CREATE", "UPDATE", "PRODUCT"}
		if len(drv.args[0]) != len(expectedArgs) {
			t.Fatalf("expected args %v, got %v", expectedArgs, drv.args[0])
		}
		for i, want := range expectedArgs {
			if drv.args[0][i] != want {
				t.Errorf("arg[%d]: want %v, got %v", i, want, drv.args[0][i])
			}
		}
	})
}

func TestSystemLogRepository_GetLogs_SearchFilter(t *testing.T) {
	t.Run("searches target_id, changes, u.username, and u.nickname with trimmed keyword", func(t *testing.T) {
		db, drv := createLogTestDB(t)
		defer db.Close()

		repo := sys_mysql.NewSystemLogRepository(db)
		_, err := repo.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{
			Page:   1,
			Limit:  20,
			Search: " andi ",
		})
		if err != nil {
			t.Fatalf("unexpected GetLogs error: %v", err)
		}

		sqlStr := drv.queries[0]
		expectedWhere := "(l.target_id LIKE ? OR l.changes LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)"
		if !strings.Contains(sqlStr, expectedWhere) {
			t.Errorf("expected SQL to contain %q, got: %s", expectedWhere, sqlStr)
		}

		expectedArgs := []driver.Value{"%andi%", "%andi%", "%andi%", "%andi%"}
		if len(drv.args[0]) != len(expectedArgs) {
			t.Fatalf("expected args %v, got %v", expectedArgs, drv.args[0])
		}
		for i, want := range expectedArgs {
			if drv.args[0][i] != want {
				t.Errorf("arg[%d]: want %v, got %v", i, want, drv.args[0][i])
			}
		}
	})

	t.Run("ignores whitespace-only search", func(t *testing.T) {
		db, drv := createLogTestDB(t)
		defer db.Close()

		repo := sys_mysql.NewSystemLogRepository(db)
		_, err := repo.GetLogs(context.Background(), system_dto.GetSystemLogsRequest{
			Page:   1,
			Limit:  20,
			Search: "   ",
		})
		if err != nil {
			t.Fatalf("unexpected GetLogs error: %v", err)
		}

		sqlStr := drv.queries[0]
		if strings.Contains(sqlStr, "LIKE") {
			t.Errorf("expected whitespace-only search to add no LIKE clause, got: %s", sqlStr)
		}
	})
}
