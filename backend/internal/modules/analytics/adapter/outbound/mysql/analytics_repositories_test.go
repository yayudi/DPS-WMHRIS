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

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type analyticsRecordedQuery struct {
	query string
	args  []driver.NamedValue
}

type analyticsStubRowsSpec struct {
	columns []string
	values  [][]driver.Value
	iterErr error
}

type analyticsStubState struct {
	mu           sync.Mutex
	queries      []analyticsRecordedQuery
	queryHandler func(query string, args []driver.NamedValue) (analyticsStubRowsSpec, error)
	beginCount   int
	commitCount  int
}

type analyticsStubDriver struct {
	mu     sync.Mutex
	states map[string]*analyticsStubState
}

var (
	analyticsDriverOnce sync.Once
	analyticsDriverInst = &analyticsStubDriver{states: make(map[string]*analyticsStubState)}
)

func openAnalyticsStubDB(t *testing.T, handler func(query string, args []driver.NamedValue) (analyticsStubRowsSpec, error)) (*sqlx.DB, *analyticsStubState) {
	t.Helper()
	analyticsDriverOnce.Do(func() {
		sql.Register("analytics_mysql_stub", analyticsDriverInst)
	})

	state := &analyticsStubState{queryHandler: handler}
	dsn := t.Name()
	analyticsDriverInst.mu.Lock()
	analyticsDriverInst.states[dsn] = state
	analyticsDriverInst.mu.Unlock()

	rawDB, err := sql.Open("analytics_mysql_stub", dsn)
	if err != nil {
		t.Fatalf("failed to open stub DB: %v", err)
	}
	t.Cleanup(func() { _ = rawDB.Close() })
	return sqlx.NewDb(rawDB, "mysql"), state
}

func (d *analyticsStubDriver) Open(name string) (driver.Conn, error) {
	d.mu.Lock()
	st := d.states[name]
	d.mu.Unlock()
	return &analyticsStubConn{state: st}, nil
}

type analyticsStubConn struct {
	state *analyticsStubState
}

func (c *analyticsStubConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare not implemented")
}

func (c *analyticsStubConn) Close() error { return nil }

func (c *analyticsStubConn) Begin() (driver.Tx, error) {
	c.state.mu.Lock()
	c.state.beginCount++
	c.state.mu.Unlock()
	return &analyticsStubTx{state: c.state}, nil
}

func (c *analyticsStubConn) BeginTx(context.Context, driver.TxOptions) (driver.Tx, error) {
	return c.Begin()
}

func (c *analyticsStubConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.state.mu.Lock()
	c.state.queries = append(c.state.queries, analyticsRecordedQuery{query: query, args: args})
	handler := c.state.queryHandler
	c.state.mu.Unlock()

	if handler == nil {
		return &analyticsStubRows{}, nil
	}
	spec, err := handler(query, args)
	if err != nil {
		return nil, err
	}
	return &analyticsStubRows{
		columns: spec.columns,
		values:  spec.values,
		iterErr: spec.iterErr,
	}, nil
}

type analyticsStubTx struct {
	state *analyticsStubState
}

func (t *analyticsStubTx) Commit() error {
	t.state.mu.Lock()
	t.state.commitCount++
	t.state.mu.Unlock()
	return nil
}

func (t *analyticsStubTx) Rollback() error { return nil }

type analyticsStubRows struct {
	columns []string
	values  [][]driver.Value
	idx     int
	iterErr error
}

func (r *analyticsStubRows) Columns() []string { return r.columns }
func (r *analyticsStubRows) Close() error      { return nil }
func (r *analyticsStubRows) Next(dest []driver.Value) error {
	if r.idx < len(r.values) {
		copy(dest, r.values[r.idx])
		r.idx++
		return nil
	}
	if r.iterErr != nil {
		err := r.iterErr
		r.iterErr = nil
		return err
	}
	return io.EOF
}

func TestReportRepository_QueriesFiltersAndRowsErr(t *testing.T) {
	t.Run("distinct filters use soft-delete guard, active tx binding, and non-nil empty slices", func(t *testing.T) {
		db, state := openAnalyticsStubDB(t, func(query string, _ []driver.NamedValue) (analyticsStubRowsSpec, error) {
			return analyticsStubRowsSpec{columns: []string{"building"}}, nil
		})
		repo := NewReportRepository(db)
		txMgr := database.NewTransactionManager(db)

		var buildings []string
		err := txMgr.WithTransaction(context.Background(), func(ctx context.Context) error {
			var err error
			buildings, err = repo.GetDistinctBuildings(ctx)
			return err
		})
		if err != nil {
			t.Fatalf("GetDistinctBuildings failed: %v", err)
		}
		if buildings == nil || len(buildings) != 0 {
			t.Fatalf("expected non-nil empty slice, got %#v", buildings)
		}
		if state.beginCount != 1 || state.commitCount != 1 {
			t.Fatalf("expected active transaction reuse (begin=1, commit=1), got begin=%d commit=%d", state.beginCount, state.commitCount)
		}
		if !strings.Contains(state.queries[0].query, "is_active = 1 AND deleted_at IS NULL") {
			t.Fatalf("expected active & soft-delete filter in query, got: %s", state.queries[0].query)
		}
	})

	t.Run("GetBuildingPurposeRelations propagates rows.Err", func(t *testing.T) {
		iterErr := errors.New("stream corrupted")
		db, _ := openAnalyticsStubDB(t, func(_ string, _ []driver.NamedValue) (analyticsStubRowsSpec, error) {
			return analyticsStubRowsSpec{
				columns: []string{"purpose", "building"},
				values:  [][]driver.Value{{[]byte("DISPLAY"), []byte("A19")}},
				iterErr: iterErr,
			}, nil
		})
		repo := NewReportRepository(db)
		_, err := repo.GetBuildingPurposeRelations(context.Background())
		if !errors.Is(err, iterErr) {
			t.Fatalf("expected rows.Err %v, got %v", iterErr, err)
		}
	})

	t.Run("GetStockReportData supports bool IsPackage and enforces soft-delete filters", func(t *testing.T) {
		db, state := openAnalyticsStubDB(t, func(_ string, _ []driver.NamedValue) (analyticsStubRowsSpec, error) {
			return analyticsStubRowsSpec{
				columns: []string{"Sku", "NamaProduk", "Lokasi", "Kuantitas", "HargaSatuan", "TotalNilai"},
			}, nil
		})
		repo := NewReportRepository(db)
		rows, err := repo.GetStockReportData(context.Background(), analytics_dto.StockReportFilter{
			StockStatus: "positive",
			IsPackage:   true,
			Building:    []string{"A19"},
		})
		if err != nil {
			t.Fatalf("GetStockReportData failed: %v", err)
		}
		if rows == nil {
			t.Fatalf("expected non-nil empty slice")
		}
		q := state.queries[0]
		for _, want := range []string{"p.deleted_at IS NULL", "(l.id IS NULL OR l.deleted_at IS NULL)", "p.is_package = ?"} {
			if !strings.Contains(q.query, want) {
				t.Errorf("expected query to contain %q, got: %s", want, q.query)
			}
		}
		if len(q.args) != 2 || q.args[0].Value != "A19" || q.args[1].Value != int64(1) {
			t.Fatalf("expected args [A19, 1], got %+v", q.args)
		}
	})
}

func TestStatisticRepository_NullSafetySoftDeleteAndStockStatus(t *testing.T) {
	db, state := openAnalyticsStubDB(t, func(query string, _ []driver.NamedValue) (analyticsStubRowsSpec, error) {
		switch {
		case strings.Contains(query, "COALESCE(l.name, '') AS name"):
			return analyticsStubRowsSpec{
				columns: []string{"location_id", "code", "name", "building", "floor", "purpose", "total_products", "total_quantity", "total_weight", "total_cbm"},
				values:  [][]driver.Value{{int64(1), "A19-1", "", "A19", "1", "DISPLAY", float64(2), float64(10), float64(500), float64(0.2)}},
			}, nil
		case strings.Contains(query, "COALESCE(CAST(NULLIF(p.category_id, '') AS UNSIGNED), 0) AS category_id"):
			return analyticsStubRowsSpec{
				columns: []string{"product_id", "sku", "name", "category_id", "category_name", "quantity", "total_weight", "total_cbm"},
				values:  [][]driver.Value{{int64(9), "SKU-9", "Uncategorized", int64(0), "-", int64(5), float64(1.2), float64(0.1)}},
			}, nil
		default:
			return analyticsStubRowsSpec{
				columns: []string{"product_id", "sku", "name", "category_id", "category", "price", "total_quantity", "total_value"},
			}, nil
		}
	})
	repo := NewStatisticRepository(db)
	ctx := context.Background()

	loads, err := repo.GetLocationLoads(ctx, analytics_dto.StatisticFilterRequest{})
	if err != nil || len(loads) != 1 || loads[0].Name != "" {
		t.Fatalf("GetLocationLoads failed: loads=%+v err=%v", loads, err)
	}

	details, err := repo.GetLocationCapacityDetails(ctx, 1, analytics_dto.StatisticFilterRequest{})
	if err != nil || len(details) != 1 || details[0].CategoryID != 0 {
		t.Fatalf("GetLocationCapacityDetails failed: details=%+v err=%v", details, err)
	}

	vals, err := repo.GetInventoryValueStats(ctx, analytics_dto.StatisticFilterRequest{StockStatus: "positive"})
	if err != nil || vals == nil {
		t.Fatalf("GetInventoryValueStats failed: vals=%#v err=%v", vals, err)
	}

	valQuery := state.queries[2].query
	for _, want := range []string{"p.deleted_at IS NULL", "(l.id IS NULL OR l.deleted_at IS NULL)", "COALESCE(sl.quantity, 0) > 0"} {
		if !strings.Contains(valQuery, want) {
			t.Errorf("GetInventoryValueStats query missing %q: %s", want, valQuery)
		}
	}
}

func TestStatsRepository_SoftDeleteAndGetExt(t *testing.T) {
	db, state := openAnalyticsStubDB(t, func(query string, _ []driver.NamedValue) (analyticsStubRowsSpec, error) {
		if strings.Contains(query, "totalInventoryValue") {
			return analyticsStubRowsSpec{
				columns: []string{"totalInventoryValue"},
				values:  [][]driver.Value{{float64(99000)}},
			}, nil
		}
		return analyticsStubRowsSpec{
			columns: []string{"building", "total_locations", "total_skus", "total_quantity"},
		}, nil
	})
	repo := NewStatsRepository(db)
	txMgr := database.NewTransactionManager(db)

	var total float64
	var dist []analytics_dto.BuildingStockSummaryDTO
	err := txMgr.WithTransaction(context.Background(), func(ctx context.Context) error {
		var err error
		if total, err = repo.GetInventoryValueKpi(ctx); err != nil {
			return err
		}
		dist, err = repo.GetBuildingDistribution(ctx)
		return err
	})
	if err != nil {
		t.Fatalf("stats repo inside tx failed: %v", err)
	}
	if total != 99000 || dist == nil || len(dist) != 0 {
		t.Fatalf("unexpected stats output: total=%v dist=%#v", total, dist)
	}
	if state.beginCount != 1 || state.commitCount != 1 {
		t.Fatalf("expected active tx usage, got begin=%d commit=%d", state.beginCount, state.commitCount)
	}
	if !strings.Contains(state.queries[0].query, "p.deleted_at IS NULL AND l.deleted_at IS NULL") {
		t.Errorf("GetInventoryValueKpi missing soft-delete filters: %s", state.queries[0].query)
	}
	if !strings.Contains(state.queries[1].query, "l.deleted_at IS NULL") || !strings.Contains(state.queries[1].query, "p.deleted_at IS NULL") {
		t.Errorf("GetBuildingDistribution missing soft-delete filters: %s", state.queries[1].query)
	}
}
