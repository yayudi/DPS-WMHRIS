package mysql

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

func TestLocationRepository_CoalesceActiveFilterTxAndGuards(t *testing.T) {
	now := time.Now()
	existsCount := int64(0)
	updateRowsAffected := int64(0)

	st := &invStubState{
		execFn: func(query string, _ []driver.NamedValue) (driver.Result, error) {
			if strings.Contains(query, "INSERT INTO locations") {
				return invStubResult{lastID: 15, rowsAffected: 1}, nil
			}
			return invStubResult{rowsAffected: updateRowsAffected}, nil
		},
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			switch {
			case strings.Contains(query, "SELECT COUNT(*)"):
				return &invStubRows{cols: []string{"count"}, data: [][]driver.Value{{existsCount}}}, nil
			case strings.Contains(query, "FROM locations"):
				return &invStubRows{
					cols: []string{"id", "created_at", "deleted_at", "code", "building", "floor", "name", "purpose", "is_active", "is_fulfillment_source"},
					data: [][]driver.Value{{int64(1), now, nil, "D-01", "B1", int64(1), "", "", true, true}},
				}, nil
			case strings.Contains(query, "SELECT sl.location_id,"):
				return &invStubRows{
					cols: []string{"location_id", "available_quantity"},
					data: [][]driver.Value{{int64(1), int64(25)}},
				}, nil
			case strings.Contains(query, "SELECT sl.location_id"):
				return &invStubRows{
					cols: []string{"location_id"},
					data: [][]driver.Value{{int64(1)}},
				}, nil
			case strings.Contains(query, "SELECT sl.product_id"):
				return &invStubRows{
					cols: []string{"product_id", "sku", "name", "quantity"},
					data: [][]driver.Value{{int64(10), "SKU-1", "Item 1", float64(5)}},
				}, nil
			default:
				return &invStubRows{}, nil
			}
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewLocationRepository(db)
	txMgr := database.NewTransactionManager(db)
	ctx := context.Background()

	// 1. FindAll and FindByID use COALESCE for nullable schema columns
	locs, err := repo.FindAll(ctx)
	if err != nil || len(locs) != 1 {
		t.Fatalf("FindAll failed: len=%d err=%v", len(locs), err)
	}
	if !strings.Contains(st.recorded[0].query, "COALESCE(name, '')") || !strings.Contains(st.recorded[0].query, "COALESCE(purpose, '')") || !strings.Contains(st.recorded[0].query, "COALESCE(is_active, 1)") {
		t.Fatalf("FindAll must COALESCE nullable columns, got: %s", st.recorded[0].query)
	}

	loc, err := repo.FindByID(ctx, 1)
	if err != nil || loc == nil || loc.ID != 1 {
		t.Fatalf("FindByID failed: loc=%+v err=%v", loc, err)
	}
	if !strings.Contains(st.recorded[1].query, "COALESCE(name, '')") {
		t.Fatalf("FindByID must COALESCE nullable columns, got: %s", st.recorded[1].query)
	}

	// 2. FindBestStock & FindAvailableStockLocations filter l.is_active = 1 AND l.deleted_at IS NULL
	bestID, err := repo.FindBestStock(ctx, 10, 5, "DISPLAY")
	if err != nil || bestID == nil || *bestID != 1 {
		t.Fatalf("FindBestStock failed: id=%v err=%v", bestID, err)
	}
	bestQ := st.recorded[2].query
	if !strings.Contains(bestQ, "l.is_active = 1") || !strings.Contains(bestQ, "l.deleted_at IS NULL") {
		t.Fatalf("FindBestStock must filter active non-deleted locations: %s", bestQ)
	}

	avail, err := repo.FindAvailableStockLocations(ctx, 10, "DISPLAY", "")
	if err != nil || len(avail) != 1 {
		t.Fatalf("FindAvailableStockLocations failed: avail=%+v err=%v", avail, err)
	}
	availQ := st.recorded[3].query
	if !strings.Contains(availQ, "l.is_active = 1") || !strings.Contains(availQ, "l.deleted_at IS NULL") {
		t.Fatalf("FindAvailableStockLocations must filter active non-deleted locations: %s", availQ)
	}

	// 3. Create & GetStockSample use database.GetExt inside active transaction
	newLoc := &domain.Location{Code: "NEW-1", Building: "B1", Purpose: "STORAGE", IsActive: true}
	err = txMgr.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := repo.Create(txCtx, newLoc); err != nil {
			return err
		}
		_, err := repo.GetStockSample(txCtx, newLoc.ID)
		return err
	})
	if err != nil || newLoc.ID != 15 {
		t.Fatalf("tx Create/GetStockSample failed: id=%d err=%v", newLoc.ID, err)
	}
	if !st.recorded[4].inTx || !st.recorded[5].inTx {
		t.Fatalf("expected Create & GetStockSample to execute inside active tx")
	}

	// 4. Update & UpdateFulfillmentSourceFlag return sql.ErrNoRows when missing, nil when unchanged
	existsCount = 0
	if err := repo.Update(ctx, &domain.Location{ImmutableEntity: kernel.ImmutableEntity{ID: 999}, Code: "X"}); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows on missing Update, got %v", err)
	}
	if err := repo.UpdateFulfillmentSourceFlag(ctx, 999, true); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows on missing UpdateFulfillmentSourceFlag, got %v", err)
	}

	existsCount = 1
	if err := repo.Update(ctx, &domain.Location{ImmutableEntity: kernel.ImmutableEntity{ID: 1}, Code: "D-01"}); err != nil {
		t.Fatalf("expected nil on unchanged existing Update, got %v", err)
	}
	if err := repo.UpdateFulfillmentSourceFlag(ctx, 1, true); err != nil {
		t.Fatalf("expected nil on unchanged existing UpdateFulfillmentSourceFlag, got %v", err)
	}

	// 5. ReleaseStock clamps reserved_quantity at zero via GREATEST(0, reserved_quantity - ?)
	if err := repo.ReleaseStock(ctx, 10, 1, 5); err != nil {
		t.Fatalf("ReleaseStock failed: %v", err)
	}
	lastQ := st.recorded[len(st.recorded)-1].query
	if !strings.Contains(lastQ, "GREATEST(0, reserved_quantity - ?)") {
		t.Fatalf("ReleaseStock must clamp reserved_quantity with GREATEST: %s", lastQ)
	}
}

func TestSlotRepository_DeleteAndPrimaryGuards(t *testing.T) {
	existsCount := int64(0)
	delAffected := int64(0)

	st := &invStubState{
		execFn: func(_ string, _ []driver.NamedValue) (driver.Result, error) {
			return invStubResult{rowsAffected: delAffected}, nil
		},
		queryFn: func(_ string, _ []driver.NamedValue) (driver.Rows, error) {
			return &invStubRows{cols: []string{"count"}, data: [][]driver.Value{{existsCount}}}, nil
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewSlotRepository(db)
	ctx := context.Background()

	// 1. DeleteSlot uses explicit DELETE and returns sql.ErrNoRows when affected == 0
	if err := repo.DeleteSlot(ctx, 404); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows on missing DeleteSlot, got %v", err)
	}
	if !strings.Contains(st.recorded[0].query, "DELETE FROM product_location_slots WHERE id = ?") {
		t.Fatalf("expected explicit DELETE query, got: %s", st.recorded[0].query)
	}

	// 2. SetPrimarySlot with non-existent slotID > 0 fails BEFORE clearing existing primary
	st.recorded = nil
	existsCount = 0
	if err := repo.SetPrimarySlot(ctx, 10, 20, 999); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows when slot ownership check fails, got %v", err)
	}
	if len(st.recorded) != 1 || !strings.Contains(st.recorded[0].query, "SELECT COUNT(*)") {
		t.Fatalf("must abort after ownership check without clearing primary, recorded=%d", len(st.recorded))
	}

	// 3. SetPrimarySlot with valid slotID > 0 checks ownership, clears primary, then sets target primary
	st.recorded = nil
	existsCount = 1
	if err := repo.SetPrimarySlot(ctx, 10, 20, 5); err != nil {
		t.Fatalf("SetPrimarySlot valid failed: %v", err)
	}
	if len(st.recorded) != 3 || !strings.Contains(st.recorded[1].query, "is_primary = 0") || !strings.Contains(st.recorded[2].query, "is_primary = 1") {
		t.Fatalf("expected 3 statements (COUNT, reset, set), got %d", len(st.recorded))
	}

	// 4. SetPrimarySlot with slotID == 0 only clears primary (1 statement)
	st.recorded = nil
	if err := repo.SetPrimarySlot(ctx, 10, 20, 0); err != nil {
		t.Fatalf("SetPrimarySlot clear-only failed: %v", err)
	}
	if len(st.recorded) != 1 || !strings.Contains(st.recorded[0].query, "is_primary = 0") {
		t.Fatalf("expected 1 reset statement when slotID==0, got %d", len(st.recorded))
	}
}

func TestStockRequestRepository_TxBatchItemsAndRowsErr(t *testing.T) {
	now := time.Now()
	var rowIterErr error

	st := &invStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "FROM stock_request_items") {
				return &invStubRows{
					cols: []string{"id", "stock_request_id", "product_id", "quantity", "received_quantity", "product_name", "sku"},
					data: [][]driver.Value{
						{int64(1), int64(10), int64(100), int64(5), int64(0), "Prod A", "SKU-A"},
						{int64(2), int64(20), int64(200), int64(3), int64(3), "Prod B", "SKU-B"},
					},
				}, nil
			}
			return &invStubRows{
				cols: []string{
					"id", "request_number", "type", "requester_id",
					"from_location_id", "to_location_id", "status",
					"notes", "created_at", "updated_at",
					"requester_name", "from_location_name", "from_location_code",
					"to_location_name", "to_location_code",
				},
				data: [][]driver.Value{
					{int64(10), "SR-10", "TRANSFER", int64(1), int64(2), int64(3), "PENDING", "", now, now, "Alice", "Loc A", "LA", "Loc B", "LB"},
				},
				err: rowIterErr,
			}, nil
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewStockRequestRepository(db)
	txMgr := database.NewTransactionManager(db)
	ctx := context.Background()

	// 1. FindAllWithJoins uses database.GetExt inside active transaction
	var gotReqs []domain.StockRequest
	err := txMgr.WithTransaction(ctx, func(txCtx context.Context) error {
		var err error
		gotReqs, err = repo.FindAllWithJoins(txCtx)
		return err
	})
	if err != nil || len(gotReqs) != 1 || gotReqs[0].ID != 10 {
		t.Fatalf("FindAllWithJoins failed: len=%d err=%v", len(gotReqs), err)
	}
	if !st.recorded[0].inTx {
		t.Fatalf("expected FindAllWithJoins to execute inside active tx")
	}

	// 2. FindAllWithJoins propagates rows.Err()
	rowIterErr = errors.New("stream corrupted")
	if _, err := repo.FindAllWithJoins(ctx); !errors.Is(err, rowIterErr) {
		t.Fatalf("expected rows.Err() propagation, got %v", err)
	}
	rowIterErr = nil

	// 3. FindItemsByRequestIDs runs a single IN (?, ?) query and groups by StockRequestID
	st.recorded = nil
	grouped, err := repo.FindItemsByRequestIDs(ctx, []int{10, 20})
	if err != nil {
		t.Fatalf("FindItemsByRequestIDs failed: %v", err)
	}
	if len(st.recorded) != 1 || !strings.Contains(st.recorded[0].query, "IN (?, ?)") {
		t.Fatalf("expected single IN (?, ?) query, recorded=%+v", st.recorded)
	}
	if len(grouped[10]) != 1 || len(grouped[20]) != 1 || grouped[10][0].SKU != "SKU-A" || grouped[20][0].SKU != "SKU-B" {
		t.Fatalf("unexpected grouped items: %+v", grouped)
	}

	// 4. Empty slice input skips DB query entirely
	st.recorded = nil
	emptyMap, err := repo.FindItemsByRequestIDs(ctx, nil)
	if err != nil || len(emptyMap) != 0 || len(st.recorded) != 0 {
		t.Fatalf("expected empty map with 0 DB queries, got map=%+v queries=%d err=%v", emptyMap, len(st.recorded), err)
	}
}
