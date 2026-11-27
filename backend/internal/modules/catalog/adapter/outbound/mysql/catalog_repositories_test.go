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

	"github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type catRecordedSQL struct {
	query string
	args  []driver.NamedValue
	inTx  bool
}

type catStubState struct {
	mu       sync.Mutex
	recorded []catRecordedSQL
	queryFn  func(query string, args []driver.NamedValue) (driver.Rows, error)
	execFn   func(query string, args []driver.NamedValue) (driver.Result, error)
}

func (s *catStubState) record(query string, args []driver.NamedValue, inTx bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	copied := make([]driver.NamedValue, len(args))
	copy(copied, args)
	s.recorded = append(s.recorded, catRecordedSQL{query: query, args: copied, inTx: inTx})
}

var (
	catStubMu     sync.Mutex
	catStubStates = map[string]*catStubState{}
	catStubOnce   sync.Once
)

type catStubDriver struct{}

func (d *catStubDriver) Open(dsn string) (driver.Conn, error) {
	catStubMu.Lock()
	st := catStubStates[dsn]
	catStubMu.Unlock()
	return &catStubConn{state: st}, nil
}

type catStubConn struct {
	state *catStubState
	inTx  bool
}

func (c *catStubConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unused") }
func (c *catStubConn) Close() error                        { return nil }
func (c *catStubConn) Begin() (driver.Tx, error)           { return c.BeginTx(context.Background(), driver.TxOptions{}) }

func (c *catStubConn) BeginTx(_ context.Context, _ driver.TxOptions) (driver.Tx, error) {
	c.inTx = true
	return &catStubTx{conn: c}, nil
}

func (c *catStubConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.state.record(query, args, c.inTx)
	if c.state.execFn != nil {
		return c.state.execFn(query, args)
	}
	return catStubResult{lastID: 1, rowsAffected: 1}, nil
}

func (c *catStubConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.state.record(query, args, c.inTx)
	if c.state.queryFn != nil {
		return c.state.queryFn(query, args)
	}
	return &catStubRows{}, nil
}

type catStubTx struct{ conn *catStubConn }

func (t *catStubTx) Commit() error   { t.conn.inTx = false; return nil }
func (t *catStubTx) Rollback() error { t.conn.inTx = false; return nil }

type catStubResult struct {
	lastID       int64
	rowsAffected int64
}

func (r catStubResult) LastInsertId() (int64, error) { return r.lastID, nil }
func (r catStubResult) RowsAffected() (int64, error) { return r.rowsAffected, nil }

type catStubRows struct {
	cols []string
	data [][]driver.Value
	idx  int
}

func (r *catStubRows) Columns() []string { return r.cols }
func (r *catStubRows) Close() error      { return nil }
func (r *catStubRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.data) {
		return io.EOF
	}
	copy(dest, r.data[r.idx])
	r.idx++
	return nil
}

func openCatalogStubDB(t *testing.T, st *catStubState) *sqlx.DB {
	t.Helper()
	catStubOnce.Do(func() {
		sql.Register("catalog_mysql_stub", &catStubDriver{})
	})
	dsn := t.Name()
	catStubMu.Lock()
	catStubStates[dsn] = st
	catStubMu.Unlock()

	rawDB, err := sql.Open("catalog_mysql_stub", dsn)
	if err != nil {
		t.Fatalf("failed to open stub db: %v", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	return sqlx.NewDb(rawDB, "mysql")
}

func TestBuildSearchProductsQuery_InStockOnlyBranches(t *testing.T) {
	// Without locationID: inStockOnly=true MUST apply global EXISTS filter (fixes commented-out else bug!)
	sqlNoLoc, _, err := buildSearchProductsQuery("bola", "", true, 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(sqlNoLoc, "EXISTS (SELECT 1 FROM stock_locations sl WHERE sl.product_id = p.id AND sl.quantity > 0)") {
		t.Fatalf("expected global EXISTS inStockOnly filter when locationID is empty, got: %s", sqlNoLoc)
	}

	// With locationID: inStockOnly=true uses location-scoped COALESCE(sl.quantity, 0) > 0 without duplicate EXISTS
	sqlWithLoc, _, err := buildSearchProductsQuery("bola", "5", true, 1, 20)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(sqlWithLoc, "COALESCE(sl.quantity, 0) > 0") {
		t.Fatalf("expected location-scoped stock filter, got: %s", sqlWithLoc)
	}
	if strings.Contains(sqlWithLoc, "EXISTS (SELECT 1 FROM stock_locations sl WHERE sl.product_id = p.id AND sl.quantity > 0)") {
		t.Fatalf("unexpected redundant global EXISTS when locationID is set: %s", sqlWithLoc)
	}
}

func TestCategoryRepository_NotFoundAndIdempotentUpdate(t *testing.T) {
	existsCount := int64(0)
	st := &catStubState{
		execFn: func(_ string, _ []driver.NamedValue) (driver.Result, error) {
			return catStubResult{rowsAffected: 0}, nil
		},
		queryFn: func(_ string, _ []driver.NamedValue) (driver.Rows, error) {
			return &catStubRows{cols: []string{"count"}, data: [][]driver.Value{{existsCount}}}, nil
		},
	}
	db := openCatalogStubDB(t, st)
	repo := NewCategoryRepository(db)
	txMgr := database.NewTransactionManager(db)

	// Missing category -> sql.ErrNoRows
	err := txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		return repo.Update(txCtx, 999, "Baru")
	})
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing category, got %v", err)
	}
	if !st.recorded[0].inTx {
		t.Fatalf("expected Update to execute inside active transaction")
	}

	// Existing category with unchanged name (rowsAffected=0, COUNT(*)=1) -> nil (idempotent)
	existsCount = 1
	if err := repo.Update(context.Background(), 1, "Sama"); err != nil {
		t.Fatalf("expected nil on idempotent no-op update, got %v", err)
	}
}

func TestProductRepository_SetPrimaryImageGuardDeleteAndDetailNotFound(t *testing.T) {
	imgExists := int64(0)
	deleteAffected := int64(0)
	st := &catStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "FROM product_images") {
				return &catStubRows{cols: []string{"count"}, data: [][]driver.Value{{imgExists}}}, nil
			}
			return &catStubRows{cols: []string{"id"}}, nil
		},
		execFn: func(query string, _ []driver.NamedValue) (driver.Result, error) {
			if strings.Contains(query, "DELETE FROM product_images") {
				return catStubResult{rowsAffected: deleteAffected}, nil
			}
			return catStubResult{rowsAffected: 1}, nil
		},
	}
	db := openCatalogStubDB(t, st)
	repo := NewProductRepository(db)
	txMgr := database.NewTransactionManager(db)

	// 1. SetPrimaryImage for missing image must return sql.ErrNoRows WITHOUT clearing existing primary
	err := repo.SetPrimaryImage(context.Background(), 1, 9999)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for missing image, got %v", err)
	}
	if len(st.recorded) != 1 {
		t.Fatalf("expected only SELECT COUNT(*) check and 0 UPDATE queries when image missing, got %d queries", len(st.recorded))
	}

	// 2. SetPrimaryImage for existing image executes inside transaction
	imgExists = 1
	err = txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		return repo.SetPrimaryImage(txCtx, 1, 5)
	})
	if err != nil {
		t.Fatalf("SetPrimaryImage failed: %v", err)
	}
	if !st.recorded[len(st.recorded)-1].inTx {
		t.Fatalf("expected SetPrimaryImage UPDATE inside active tx")
	}

	// 3. DeleteProductImage missing -> sql.ErrNoRows
	if err := repo.DeleteProductImage(context.Background(), 9999); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows on missing image delete, got %v", err)
	}

	// 4. GetProductDetailWithStock missing -> (nil, sql.ErrNoRows)
	detail, err := repo.GetProductDetailWithStock(context.Background(), 9999)
	if !errors.Is(err, sql.ErrNoRows) || detail != nil {
		t.Fatalf("expected (nil, sql.ErrNoRows), got (%v, %v)", detail, err)
	}
}

func TestProductAuditRepository_CreateTxAware(t *testing.T) {
	st := &catStubState{
		execFn: func(_ string, _ []driver.NamedValue) (driver.Result, error) {
			return catStubResult{lastID: 77, rowsAffected: 1}, nil
		},
	}
	db := openCatalogStubDB(t, st)
	repo := NewProductAuditRepository(db)
	txMgr := database.NewTransactionManager(db)

	entry := &domain.ProductAuditLog{ProductID: 1, Action: domain.ProductAuditActionCreate}
	err := txMgr.WithTransaction(context.Background(), func(txCtx context.Context) error {
		return repo.Create(txCtx, entry)
	})
	if err != nil {
		t.Fatalf("audit Create failed: %v", err)
	}
	if entry.ID != 77 || !st.recorded[0].inTx {
		t.Fatalf("expected ID=77 inside tx, got ID=%d inTx=%v", entry.ID, st.recorded[0].inTx)
	}
}
