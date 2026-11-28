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

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type invRecordedSQL struct {
	query string
	args  []driver.NamedValue
	inTx  bool
}

type invStubState struct {
	mu       sync.Mutex
	recorded []invRecordedSQL
	queryFn  func(query string, args []driver.NamedValue) (driver.Rows, error)
	execFn   func(query string, args []driver.NamedValue) (driver.Result, error)
}

func (s *invStubState) record(query string, args []driver.NamedValue, inTx bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	copied := make([]driver.NamedValue, len(args))
	copy(copied, args)
	s.recorded = append(s.recorded, invRecordedSQL{query: query, args: copied, inTx: inTx})
}

var (
	invStubMu     sync.Mutex
	invStubStates = map[string]*invStubState{}
	invStubOnce   sync.Once
)

type invStubDriver struct{}

func (d *invStubDriver) Open(dsn string) (driver.Conn, error) {
	invStubMu.Lock()
	st := invStubStates[dsn]
	invStubMu.Unlock()
	return &invStubConn{state: st}, nil
}

type invStubConn struct {
	state *invStubState
	inTx  bool
}

func (c *invStubConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unused") }
func (c *invStubConn) Close() error                        { return nil }
func (c *invStubConn) Begin() (driver.Tx, error)           { return c.BeginTx(context.Background(), driver.TxOptions{}) }

func (c *invStubConn) BeginTx(_ context.Context, _ driver.TxOptions) (driver.Tx, error) {
	c.inTx = true
	return &invStubTx{conn: c}, nil
}

func (c *invStubConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.record(query, args, c.inTx)
	if c.state.execFn != nil {
		return c.state.execFn(query, args)
	}
	return invStubResult{lastID: 1, rowsAffected: 1}, nil
}

func (c *invStubConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.state.record(query, args, c.inTx)
	if c.state.queryFn != nil {
		return c.state.queryFn(query, args)
	}
	return &invStubRows{}, nil
}

type invStubTx struct{ conn *invStubConn }

func (t *invStubTx) Commit() error   { t.conn.inTx = false; return nil }
func (t *invStubTx) Rollback() error { t.conn.inTx = false; return nil }

type invStubResult struct {
	lastID       int64
	rowsAffected int64
}

func (r invStubResult) LastInsertId() (int64, error) { return r.lastID, nil }
func (r invStubResult) RowsAffected() (int64, error) { return r.rowsAffected, nil }

type invStubRows struct {
	cols []string
	data [][]driver.Value
	idx  int
	err  error
}

func (r *invStubRows) Columns() []string { return r.cols }
func (r *invStubRows) Close() error      { return nil }
func (r *invStubRows) Next(dest []driver.Value) error {
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

func openInventoryStubDB(t *testing.T, st *invStubState) *sqlx.DB {
	t.Helper()
	invStubOnce.Do(func() {
		sql.Register("inventory_mysql_stub", &invStubDriver{})
	})
	dsn := t.Name()
	invStubMu.Lock()
	invStubStates[dsn] = st
	invStubMu.Unlock()

	rawDB, err := sql.Open("inventory_mysql_stub", dsn)
	if err != nil {
		t.Fatalf("failed to open stub db: %v", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	return sqlx.NewDb(rawDB, "mysql")
}

func TestSalesChannelRepository_TxFindByIDAndNotFound(t *testing.T) {
	existsCount := int64(0)
	st := &invStubState{
		execFn: func(_ string, _ []driver.NamedValue) (driver.Result, error) {
			return invStubResult{rowsAffected: 0}, nil
		},
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "SELECT COUNT(*)") {
				return &invStubRows{cols: []string{"count"}, data: [][]driver.Value{{existsCount}}}, nil
			}
			return &invStubRows{
				cols: []string{"id", "platform", "name", "description", "is_active", "created_at", "updated_at"},
				data: [][]driver.Value{{int64(2), "Offline", "Legacy", nil, false, "2026-01-01", "2026-01-01"}},
			}, nil
		},
	}
	db := openInventoryStubDB(t, st)
	repo := NewSalesChannelRepository(db)
	txMgr := database.NewTransactionManager(db)

	// 1. FindByID queries by id WITHOUT filtering is_active=1 (can read inactive channel)
	ch, err := repo.FindByID(context.Background(), 2)
	if err != nil || ch == nil || ch.IsActive {
		t.Fatalf("expected inactive channel ID=2, got %+v err=%v", ch, err)
	}
	if strings.Contains(st.recorded[0].query, "is_active = 1") {
		t.Fatalf("FindByID must not filter is_active=1: %s", st.recorded[0].query)
	}

	// 2. Update missing channel inside tx -> sql.ErrNoRows
	err = txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		_, err := repo.Update(txCtx, 999, inventory_dto.UpdateSalesChannelRequest{Platform: "Shopee", Name: "X"})
		return err
	})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing channel update, got %v", err)
	}
	if !st.recorded[1].inTx {
		t.Fatalf("expected Update to run inside active transaction")
	}

	// 3. Update unchanged existing channel (rowsAffected=0, COUNT(*)=1) -> (1, nil)
	existsCount = 1
	aff, err := repo.Update(context.Background(), 2, inventory_dto.UpdateSalesChannelRequest{Platform: "Offline", Name: "Legacy"})
	if err != nil || aff != 1 {
		t.Fatalf("expected idempotent update (1, nil), got (%d, %v)", aff, err)
	}

	// 4. Delete missing channel -> sql.ErrNoRows
	if _, err := repo.Delete(context.Background(), 999); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing channel delete, got %v", err)
	}
}
