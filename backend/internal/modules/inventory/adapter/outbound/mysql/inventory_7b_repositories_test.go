package mysql

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

func TestStockRepository_LockForUpdateAndCoalesceTx(t *testing.T) {
	now := time.Now()
	st := &invStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			switch {
			case strings.Contains(query, "FOR UPDATE"):
				return &invStubRows{
					cols: []string{"id", "product_id", "location_id", "quantity", "reserved_quantity", "updated_at"},
					data: [][]driver.Value{{int64(1), int64(10), int64(2), int64(15), int64(4), now}},
				}, nil
			case strings.Contains(query, "SELECT DISTINCT movement_type"):
				return &invStubRows{
					cols: []string{"movement_type"},
					data: [][]driver.Value{{"INBOUND"}, {"TRANSFER"}},
				}, nil
			default:
				return &invStubRows{
					cols: []string{"id", "product_id", "sku", "product_name", "location_id", "location_code", "location_name", "quantity", "reserved_quantity", "updated_at"},
					data: [][]driver.Value{{int64(1), int64(10), "SKU-1", "Prod", int64(2), "L1", "", int64(15), int64(4), now}},
				}, nil
			}
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewStockRepository(db)
	txMgr := database.NewTransactionManager(db)
	ctx := context.Background()

	// 1. GetStockByLocation selects reserved_quantity and locks row FOR UPDATE inside active tx
	var gotStock *domain.StockLocation
	err := txMgr.WithTransaction(ctx, func(txCtx context.Context) error {
		var err error
		gotStock, err = repo.GetStockByLocation(txCtx, 10, 2)
		if err != nil {
			return err
		}
		_, err = repo.GetAllStocks(txCtx)
		if err != nil {
			return err
		}
		_, err = repo.GetMovementTypes(txCtx)
		return err
	})
	if err != nil {
		t.Fatalf("tx stock repo ops failed: %v", err)
	}
	if gotStock == nil || gotStock.Quantity != 15 || gotStock.ReservedQuantity != 4 {
		t.Fatalf("unexpected locked stock: %+v", gotStock)
	}
	if !strings.Contains(st.recorded[0].query, "FOR UPDATE") || !strings.Contains(st.recorded[0].query, "reserved_quantity") || !st.recorded[0].inTx {
		t.Fatalf("GetStockByLocation must lock FOR UPDATE & select reserved_quantity inside tx: %+v", st.recorded[0])
	}
	if !strings.Contains(st.recorded[1].query, "COALESCE(l.name, '')") || !strings.Contains(st.recorded[1].query, "l.deleted_at IS NULL") || !st.recorded[1].inTx {
		t.Fatalf("GetAllStocks must COALESCE l.name, filter deleted_at, and use tx ext: %+v", st.recorded[1])
	}
	if !st.recorded[2].inTx {
		t.Fatalf("GetMovementTypes must execute via database.GetExt inside tx")
	}
}

func TestStockQueryRepository_CoalesceLocationName(t *testing.T) {
	st := &invStubState{
		queryFn: func(_ string, _ []driver.NamedValue) (driver.Rows, error) {
			return &invStubRows{
				cols: []string{"location_id", "location_name", "product_id", "product_name", "quantity", "reserved_quantity", "available_quantity"},
				data: [][]driver.Value{},
			}, nil
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewStockQueryRepository(db)

	locID := 5
	balances, err := repo.GetBalances(context.Background(), &locID, nil)
	if err != nil || balances == nil || len(balances) != 0 {
		t.Fatalf("expected non-nil empty balances, got %#v err=%v", balances, err)
	}
	q := st.recorded[0].query
	if !strings.Contains(q, "COALESCE(l.name, '')") || !strings.Contains(q, "l.deleted_at IS NULL") {
		t.Fatalf("GetBalances must COALESCE l.name and filter deleted_at: %s", q)
	}
}

func TestStockTransactionRepository_HydratesLinesPersistsStatusAndBatchesHeld(t *testing.T) {
	now := time.Now()
	st := &invStubState{
		execFn: func(_ string, _ []driver.NamedValue) (driver.Result, error) {
			return invStubResult{lastID: 77, rowsAffected: 1}, nil
		},
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			switch {
			case strings.Contains(query, "FROM inv_transactions"):
				return &invStubRows{
					cols: []string{"id", "transaction_number", "reference_type", "reference_id", "assigned_building", "status", "notes", "created_by", "created_at", "updated_at"},
					data: [][]driver.Value{{int64(1), "TRX-1", "ORDER", "ORD-1", "B1", "READY_TO_PICK", nil, nil, now, now}},
				}, nil
			case strings.Contains(query, "FROM inv_movements"):
				return &invStubRows{
					cols: []string{"id", "transaction_id", "product_id", "target_quantity", "status", "created_at"},
					data: [][]driver.Value{{int64(10), int64(1), int64(50), int64(10), "PENDING", now}},
				}, nil
			case strings.Contains(query, "FROM inv_movement_lines"):
				return &invStubRows{
					cols: []string{"id", "movement_id", "scanned_location_id", "qty_done", "scanned_by", "created_at"},
					data: [][]driver.Value{{int64(100), int64(10), int64(3), int64(6), int64(9), now}},
				}, nil
			default:
				return &invStubRows{}, nil
			}
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewStockTransactionRepository(db)
	ctx := context.Background()

	// 1. GetByID hydrates inv_movements AND inv_movement_lines
	trx, err := repo.GetByID(ctx, 1)
	if err != nil || trx == nil || len(trx.Movements) != 1 || len(trx.Movements[0].Lines) != 1 || trx.Movements[0].Lines[0].QtyDone != 6 {
		t.Fatalf("GetByID must hydrate existing movement lines, got %+v err=%v", trx, err)
	}

	// 2. GetByTransactionNo is implemented and hydrates movements & lines
	trxByNo, err := repo.GetByTransactionNo(ctx, "TRX-1")
	if err != nil || trxByNo == nil || trxByNo.TransactionNo != "TRX-1" || len(trxByNo.Movements) != 1 {
		t.Fatalf("GetByTransactionNo failed: %+v err=%v", trxByNo, err)
	}

	// 3. SaveFulfillmentTx inserts unsaved lines AND updates inv_transactions + inv_movements statuses
	st.recorded = nil
	trx.Movements[0].Lines = append(trx.Movements[0].Lines, &domain.TransactionMovementLine{
		MovementID: 10, ScannedLocationID: 4, QtyDone: 4, ScannedBy: 9, CreatedAt: now,
	})
	trx.Movements[0].Status = domain.TransactionStatusCompleted
	trx.Status = domain.TransactionStatusCompleted

	if err := repo.SaveFulfillmentTx(ctx, trx); err != nil {
		t.Fatalf("SaveFulfillmentTx failed: %v", err)
	}
	if len(st.recorded) != 3 ||
		!strings.Contains(st.recorded[0].query, "INSERT INTO inv_movement_lines") ||
		!strings.Contains(st.recorded[1].query, "UPDATE inv_transactions SET status") ||
		!strings.Contains(st.recorded[2].query, "UPDATE inv_movements SET status") {
		t.Fatalf("SaveFulfillmentTx must insert line and update trx + movement statuses, got %+v", st.recorded)
	}

	// 4. GetHeldTransactions batch-loads movements via IN (?) (2 queries total, no N+1)
	st.recorded = nil
	held, err := repo.GetHeldTransactions(ctx, "")
	if err != nil || len(held) != 1 || len(held[0].Movements) != 1 {
		t.Fatalf("GetHeldTransactions failed: len=%d err=%v", len(held), err)
	}
	if len(st.recorded) != 2 || !strings.Contains(st.recorded[1].query, "WHERE transaction_id IN (?)") {
		t.Fatalf("GetHeldTransactions must batch-load movements via IN (?), got %+v", st.recorded)
	}
}

func TestOutboxRepository_RetryCeilingAndFailedTransition(t *testing.T) {
	st := &invStubState{
		queryFn: func(_ string, _ []driver.NamedValue) (driver.Rows, error) {
			return &invStubRows{
				cols: []string{"id", "aggregate_type", "aggregate_id", "event_type", "payload", "status", "retry_count", "created_at", "published_at"},
				data: [][]driver.Value{},
			}, nil
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewOutboxRepository(db)
	ctx := context.Background()

	events, err := repo.GetPendingEvents(ctx, 0)
	if err != nil || events == nil || len(events) != 0 {
		t.Fatalf("expected non-nil empty events, got %#v err=%v", events, err)
	}
	if !strings.Contains(st.recorded[0].query, "retry_count < ?") {
		t.Fatalf("GetPendingEvents must enforce retry ceiling: %s", st.recorded[0].query)
	}

	if err := repo.IncrementRetry(ctx, 99); err != nil {
		t.Fatalf("IncrementRetry failed: %v", err)
	}
	incQ := st.recorded[1].query
	if !strings.Contains(incQ, "CASE WHEN retry_count + 1 >= ? THEN ? ELSE status END") {
		t.Fatalf("IncrementRetry must transition exhausted events to FAILED: %s", incQ)
	}
}

func TestStockRepository_SargableDateFilters(t *testing.T) {
	st := &invStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "SELECT COUNT(*)") {
				return &invStubRows{cols: []string{"count"}, data: [][]driver.Value{{int64(0)}}}, nil
			}
			return &invStubRows{cols: []string{"id"}, data: [][]driver.Value{}}, nil
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewStockRepository(db)
	ctx := context.Background()

	if _, err := repo.GetBatchLogs(ctx, inventory_dto.BatchLogFilter{StartDate: "2026-09-01", Page: 1, Limit: 20}); err != nil {
		t.Fatalf("GetBatchLogs failed: %v", err)
	}
	if _, err := repo.GetStockHistory(ctx, inventory_dto.StockHistoryFilter{ProductID: 10, StartDate: "2026-09-01", EndDate: "2026-09-30", Page: 1, Limit: 20}); err != nil {
		t.Fatalf("GetStockHistory failed: %v", err)
	}

	for _, rec := range st.recorded {
		if strings.Contains(rec.query, "DATE(sm.created_at)") {
			t.Fatalf("expected SARGable sm.created_at predicate instead of DATE(sm.created_at): %s", rec.query)
		}
	}
	if !strings.Contains(st.recorded[0].query, "sm.created_at >= ?") {
		t.Fatalf("GetBatchLogs missing SARGable startDate predicate: %s", st.recorded[0].query)
	}
	lastQ := st.recorded[len(st.recorded)-1].query
	if !strings.Contains(lastQ, "sm.created_at >= ?") || !strings.Contains(lastQ, "sm.created_at <= CONCAT(?, ' 23:59:59')") {
		t.Fatalf("GetStockHistory missing SARGable date range predicates: %s", lastQ)
	}

	// Keyset streaming mode (SkipCount=true) bypasses COUNT(*), filters sm.id < ?, orders by sm.id DESC, and uses active tx
	st.recorded = nil
	txMgr := database.NewTransactionManager(db)
	err := txMgr.WithTransaction(ctx, func(txCtx context.Context) error {
		res, err := repo.GetBatchLogs(txCtx, inventory_dto.BatchLogFilter{
			StartDate: "2026-09-01",
			EndDate:   "2026-09-30",
			BeforeID:  500,
			Limit:     5000,
			SkipCount: true,
		})
		if err != nil {
			return err
		}
		if res.Data == nil {
			t.Fatalf("expected non-nil empty Data slice in SkipCount mode")
		}
		return nil
	})
	if err != nil {
		t.Fatalf("keyset GetBatchLogs failed: %v", err)
	}
	if len(st.recorded) != 1 {
		t.Fatalf("SkipCount mode must execute exactly 1 query without COUNT(*), got %d", len(st.recorded))
	}
	keysetQ := st.recorded[0]
	if !keysetQ.inTx || !strings.Contains(keysetQ.query, "AND sm.id < ?") || !strings.Contains(keysetQ.query, "ORDER BY sm.id DESC LIMIT ?") {
		t.Fatalf("unexpected keyset query: %+v", keysetQ)
	}
}
