package mysql

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

func TestInvestigationRepository_RevertLockPrefixAndEndDate(t *testing.T) {
	st := &invStubState{
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			switch {
			case strings.Contains(query, "FOR UPDATE"):
				return &invStubRows{
					cols: []string{"id", "product_id", "quantity", "from_location_id", "to_location_id", "movement_type", "notes"},
					data: [][]driver.Value{{int64(1), int64(50), int64(4), int64(10), int64(20), "TRANSFER", "Mov 1"}},
				}, nil
			case strings.Contains(query, "SELECT COUNT(*)"):
				return &invStubRows{cols: []string{"count"}, data: [][]driver.Value{{int64(0)}}}, nil
			default:
				return &invStubRows{
					cols: []string{"id", "product_id", "quantity", "from_location_id", "from_location_code", "to_location_id", "to_location_code", "movement_type", "user_id", "username", "notes", "created_at", "sku", "product_name"},
					data: [][]driver.Value{},
				}, nil
			}
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewInvestigationRepository(db)
	txMgr := database.NewTransactionManager(db)
	ctx := context.Background()

	// 1. Revert repo helpers run inside active tx with FOR UPDATE and exact delimiter pattern
	err := txMgr.WithTransaction(ctx, func(txCtx context.Context) error {
		mov, err := repo.GetMovementByIDForRevert(txCtx, 1)
		if err != nil || mov == nil || mov.ID != 1 {
			t.Fatalf("GetMovementByIDForRevert failed: mov=%+v err=%v", mov, err)
		}
		reverted, err := repo.IsMovementReverted(txCtx, 1)
		if err != nil || reverted {
			t.Fatalf("IsMovementReverted failed: reverted=%v err=%v", reverted, err)
		}
		return repo.MarkMovementReverted(txCtx, 1)
	})
	if err != nil {
		t.Fatalf("tx investigation revert ops failed: %v", err)
	}
	if !st.recorded[0].inTx || !strings.Contains(st.recorded[0].query, "FOR UPDATE") {
		t.Fatalf("GetMovementByIDForRevert must lock FOR UPDATE in tx: %+v", st.recorded[0])
	}
	if !st.recorded[1].inTx || len(st.recorded[1].args) != 1 || st.recorded[1].args[0].Value != "Reversal of Trx #1 -%" {
		t.Fatalf("IsMovementReverted must use exact delimiter prefix (no #1 vs #10 collision): %+v", st.recorded[1])
	}
	if !st.recorded[2].inTx || !strings.Contains(st.recorded[2].query, "[REVERTED]") {
		t.Fatalf("MarkMovementReverted must execute inside tx: %+v", st.recorded[2])
	}

	// 2. EndDate-only filter supported and empty results return non-nil slice
	st.recorded = nil
	items, err := repo.GetDuplicateGroups(ctx, inventory_dto.GetDuplicateTransactionsRequest{
		EndDate: "2026-11-28", Page: 1, Limit: 10,
	})
	if err != nil || items == nil || len(items) != 0 {
		t.Fatalf("expected non-nil empty duplicate groups, got %#v err=%v", items, err)
	}
	if !strings.Contains(st.recorded[0].query, "DATE(sm.created_at) <= ?") {
		t.Fatalf("expected EndDate-only filter clause: %s", st.recorded[0].query)
	}
}

func TestReturnRepository_CreateManualReturnTxAndDeletedFilter(t *testing.T) {
	st := &invStubState{
		execFn: func(_ string, _ []driver.NamedValue) (driver.Result, error) {
			return invStubResult{lastID: 33, rowsAffected: 1}, nil
		},
		queryFn: func(query string, _ []driver.NamedValue) (driver.Rows, error) {
			if strings.Contains(query, "COUNT(*)") {
				return &invStubRows{cols: []string{"count"}, data: [][]driver.Value{{int64(0)}}}, nil
			}
			return &invStubRows{
				cols: []string{"type", "id", "reference", "product_name", "sku", "quantity", "condition", "notes", "date", "source"},
				data: [][]driver.Value{},
			}, nil
		},
	}

	db := openInventoryStubDB(t, st)
	repo := NewReturnRepository(db)
	txMgr := database.NewTransactionManager(db)
	ctx := context.Background()

	mr := &domain.ManualReturn{UserID: 1, ProductID: 5, Quantity: 2, Condition: "GOOD"}
	if err := txMgr.WithTransaction(ctx, func(txCtx context.Context) error {
		return repo.CreateManualReturn(txCtx, mr)
	}); err != nil {
		t.Fatalf("CreateManualReturn failed: %v", err)
	}
	if mr.ID != 33 || !st.recorded[0].inTx {
		t.Fatalf("expected ID=33 inside active tx, got ID=%d inTx=%v", mr.ID, st.recorded[0].inTx)
	}

	st.recorded = nil
	if _, err := repo.GetManualReturnHistory(ctx, 1, 10, "SKU"); err != nil {
		t.Fatalf("GetManualReturnHistory failed: %v", err)
	}
	if len(st.recorded) == 0 || !strings.Contains(st.recorded[0].query, "p.deleted_at IS NULL") {
		t.Fatalf("GetManualReturnHistory must filter p.deleted_at IS NULL: %+v", st.recorded)
	}
}
