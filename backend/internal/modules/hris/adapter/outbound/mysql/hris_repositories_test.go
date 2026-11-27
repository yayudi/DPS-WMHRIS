package mysql

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

	"github.com/dps-wmhris/backend/internal/modules/hris/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type recordedSQL struct {
	query string
	args  []driver.NamedValue
	inTx  bool
}

type hrisStubState struct {
	mu       sync.Mutex
	recorded []recordedSQL
	queryFn  func(query string, args []driver.NamedValue) (driver.Rows, error)
	execFn   func(query string, args []driver.NamedValue) (driver.Result, error)
}

func (s *hrisStubState) record(query string, args []driver.NamedValue, inTx bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	copied := make([]driver.NamedValue, len(args))
	copy(copied, args)
	s.recorded = append(s.recorded, recordedSQL{query: query, args: copied, inTx: inTx})
}

var (
	hrisStubMu     sync.Mutex
	hrisStubStates = map[string]*hrisStubState{}
	hrisStubOnce   sync.Once
)

type hrisStubDriver struct{}

func (d *hrisStubDriver) Open(dsn string) (driver.Conn, error) {
	hrisStubMu.Lock()
	st := hrisStubStates[dsn]
	hrisStubMu.Unlock()
	return &hrisStubConn{state: st}, nil
}

type hrisStubConn struct {
	state *hrisStubState
	inTx  bool
}

func (c *hrisStubConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unused") }
func (c *hrisStubConn) Close() error                        { return nil }
func (c *hrisStubConn) Begin() (driver.Tx, error)           { return c.BeginTx(context.Background(), driver.TxOptions{}) }

func (c *hrisStubConn) BeginTx(_ context.Context, _ driver.TxOptions) (driver.Tx, error) {
	c.inTx = true
	return &hrisStubTx{conn: c}, nil
}

func (c *hrisStubConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.record(query, args, c.inTx)
	if c.state.execFn != nil {
		return c.state.execFn(query, args)
	}
	return hrisStubResult{lastID: 1, rowsAffected: 1}, nil
}

func (c *hrisStubConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.state.record(query, args, c.inTx)
	if c.state.queryFn != nil {
		return c.state.queryFn(query, args)
	}
	return &hrisStubRows{}, nil
}

type hrisStubTx struct {
	conn *hrisStubConn
}

func (t *hrisStubTx) Commit() error   { t.conn.inTx = false; return nil }
func (t *hrisStubTx) Rollback() error { t.conn.inTx = false; return nil }

type hrisStubResult struct {
	lastID       int64
	rowsAffected int64
}

func (r hrisStubResult) LastInsertId() (int64, error) { return r.lastID, nil }
func (r hrisStubResult) RowsAffected() (int64, error) { return r.rowsAffected, nil }

type hrisStubRows struct {
	cols []string
	data [][]driver.Value
	idx  int
	err  error
}

func (r *hrisStubRows) Columns() []string { return r.cols }
func (r *hrisStubRows) Close() error      { return nil }
func (r *hrisStubRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.data) {
		if r.err != nil {
			return r.err
		}
		return io.EOF
	}
	copy(dest, r.data[r.idx])
	r.idx++
	return nil
}

func openHRISStubDB(t *testing.T, st *hrisStubState) *sqlx.DB {
	t.Helper()
	hrisStubOnce.Do(func() {
		sql.Register("hris_mysql_stub", &hrisStubDriver{})
	})
	dsn := t.Name()
	hrisStubMu.Lock()
	hrisStubStates[dsn] = st
	hrisStubMu.Unlock()

	rawDB, err := sql.Open("hris_mysql_stub", dsn)
	if err != nil {
		t.Fatalf("failed to open stub db: %v", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	return sqlx.NewDb(rawDB, "mysql")
}

func TestAttendanceRepository_UpsertLogAtomicAndTxAware(t *testing.T) {
	st := &hrisStubState{}
	db := openHRISStubDB(t, st)
	repo := NewAttendanceRepository(db)
	txMgr := database.NewTransactionManager(db)

	status := domain.AttendanceStatusHadir
	err := txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		return repo.UpsertLog(txCtx, &domain.AttendanceLog{
			Username:          "budi",
			Date:              "2026-03-02",
			LatenessMinutes:   20,
			OvertimeMinutes:   10,
			LatePardonMinutes: -1, // Preserve existing pardon on duplicate
			Status:            &status,
		})
	})
	if err != nil {
		t.Fatalf("UpsertLog failed: %v", err)
	}

	if len(st.recorded) != 1 {
		t.Fatalf("expected single atomic INSERT..ON DUPLICATE KEY UPDATE query, got %d queries", len(st.recorded))
	}
	rec := st.recorded[0]
	if !rec.inTx {
		t.Fatalf("expected UpsertLog to execute inside active transaction via database.GetExt")
	}
	if !strings.Contains(rec.query, "ON DUPLICATE KEY UPDATE") || !strings.Contains(rec.query, "IF(? < 0, late_pardon_minutes") {
		t.Fatalf("unexpected upsert SQL: %s", rec.query)
	}
	// Arg index 6 is insertPardon (clamped to 0), arg index 9 is raw LatePardonMinutes (-1)
	if rec.args[6].Value != int64(0) || rec.args[9].Value != int64(-1) {
		t.Fatalf("unexpected pardon args: insert=%v cond=%v", rec.args[6].Value, rec.args[9].Value)
	}
}

func TestAttendanceRepository_MonthlyLogsPardonAndHolidaysErrors(t *testing.T) {
	st := &hrisStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "FROM holidays") {
				return &hrisStubRows{
					cols: []string{"date", "name"},
					data: [][]driver.Value{
						{time.Date(2026, 8, 17, 0, 0, 0, 0, time.UTC), "Hari Kemerdekaan"},
					},
				}, nil
			}
			return &hrisStubRows{cols: []string{"id"}}, nil
		},
	}
	db := openHRISStubDB(t, st)
	repo := NewAttendanceRepository(db)

	monthly, err := repo.GetMonthlyLogs(context.Background(), 2026, 3)
	if err != nil {
		t.Fatalf("GetMonthlyLogs failed: %v", err)
	}
	if monthly == nil || len(monthly) != 0 {
		t.Fatalf("expected non-nil empty slice, got %#v", monthly)
	}
	if !strings.Contains(st.recorded[0].query, "late_pardon_minutes") {
		t.Fatalf("expected GetMonthlyLogs query to include late_pardon_minutes, got: %s", st.recorded[0].query)
	}

	holidays, err := repo.GetHolidays(context.Background(), 2026)
	if err != nil {
		t.Fatalf("GetHolidays failed: %v", err)
	}
	if !holidays["2026-08-17"] {
		t.Fatalf("expected 2026-08-17 in holiday map, got %+v", holidays)
	}

	// Row scan error in GetHolidays must be propagated (not silently swallowed via continue)
	st.queryFn = func(_ string, _ []driver.NamedValue) (driver.Rows, error) {
		return &hrisStubRows{
			cols: []string{"date", "name"},
			data: [][]driver.Value{{"not-a-time", "Corrupt"}},
		}, nil
	}
	if _, err := repo.GetHolidays(context.Background(), 2026); err == nil {
		t.Fatalf("expected scan error from GetHolidays, got nil")
	}
}

func TestScheduleRepository_TxAwareAndNotFoundHandling(t *testing.T) {
	st := &hrisStubState{
		queryFn: func(_ string, _ []driver.NamedValue) (driver.Rows, error) {
			return &hrisStubRows{cols: []string{"id", "user_id", "shift_id", "date", "shift_name", "start_time", "end_time", "flexible_minutes"}}, nil
		},
	}
	db := openHRISStubDB(t, st)
	repo := NewScheduleRepository(db)
	txMgr := database.NewTransactionManager(db)

	// GetByDate returns nil, nil on sql.ErrNoRows
	sch, err := repo.GetByDate(context.Background(), 1, "2026-03-05")
	if err != nil || sch != nil {
		t.Fatalf("expected (nil, nil) on no rows, got (%v, %v)", sch, err)
	}

	// GetByRange returns non-nil empty slice
	list, err := repo.GetByRange(context.Background(), 1, "2026-03-01", "2026-03-10")
	if err != nil || list == nil || len(list) != 0 {
		t.Fatalf("expected non-nil empty slice, got (%#v, %v)", list, err)
	}

	// Upsert & Delete execute inside active transaction
	createdBy := 99
	err = txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		if err := repo.Upsert(txCtx, 1, 2, "2026-03-05", &createdBy); err != nil {
			return err
		}
		return repo.Delete(txCtx, 1, "2026-03-05")
	})
	if err != nil {
		t.Fatalf("tx upsert/delete failed: %v", err)
	}
	if !st.recorded[2].inTx || !st.recorded[3].inTx {
		t.Fatalf("expected Upsert and Delete to execute inside active transaction")
	}
}

func TestShiftRepository_CoalesceExplicitDeleteAndFallback(t *testing.T) {
	now := time.Now().UTC()
	st := &hrisStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "INNER JOIN shifts") {
				return &hrisStubRows{cols: []string{"id", "name", "start_time", "end_time", "work_days", "flexible_minutes", "is_default", "created_at", "updated_at"}}, nil
			}
			if strings.Contains(query, "WHERE is_default = 1") {
				return &hrisStubRows{
					cols: []string{"id", "name", "start_time", "end_time", "work_days", "flexible_minutes", "is_default", "created_at", "updated_at"},
					data: [][]driver.Value{{int64(1), "Default", "08:00:00", "16:00:00", "1,2,3,4,5", int64(10), true, now, now}},
				}, nil
			}
			return &hrisStubRows{cols: []string{"id", "name", "start_time", "end_time", "work_days", "flexible_minutes", "is_default", "created_at", "updated_at"}}, nil
		},
	}
	db := openHRISStubDB(t, st)
	repo := NewShiftRepository(db)
	txMgr := database.NewTransactionManager(db)

	// GetAll returns non-nil empty slice and uses COALESCE
	all, err := repo.GetAll(context.Background())
	if err != nil || all == nil {
		t.Fatalf("expected non-nil empty slice, got %#v err=%v", all, err)
	}
	if !strings.Contains(st.recorded[0].query, "COALESCE(work_days") {
		t.Fatalf("expected COALESCE in GetAll query: %s", st.recorded[0].query)
	}

	// GetUserShift falls back to default shift when INNER JOIN returns 0 rows
	sh, err := repo.GetUserShift(context.Background(), "budi")
	if err != nil || sh == nil || sh.Name != "Default" || sh.FlexibleMinutes != 10 {
		t.Fatalf("expected fallback default shift, got %+v err=%v", sh, err)
	}

	// Delete executes explicit DELETE FROM shifts inside active transaction
	err = txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		return repo.Delete(txCtx, 2)
	})
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	last := st.recorded[len(st.recorded)-1]
	if !last.inTx || !strings.HasPrefix(strings.TrimSpace(last.query), "DELETE FROM shifts") {
		t.Fatalf("expected explicit DELETE FROM shifts inside tx, got inTx=%v query=%s", last.inTx, last.query)
	}
}
