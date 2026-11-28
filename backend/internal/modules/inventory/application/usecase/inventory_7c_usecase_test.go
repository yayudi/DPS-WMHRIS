package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type mockReturnRepo7C struct {
	inventory_port.ReturnRepository
	created []*domain.ManualReturn
}

func (m *mockReturnRepo7C) CreateManualReturn(_ context.Context, mr *domain.ManualReturn) error {
	mr.ID = len(m.created) + 1
	copied := *mr
	m.created = append(m.created, &copied)
	return nil
}

type mockLocRepo7C struct {
	inventory_port.LocationRepository
	byID            map[int]*domain.Location
	stockByLoc      map[int]int
	incremented     []struct{ prodID, locID, qty int }
	deducted        []struct{ prodID, locID, qty int }
	lockForUpdCalls int
}

func (m *mockLocRepo7C) FindByID(_ context.Context, id int) (*domain.Location, error) {
	if loc, ok := m.byID[id]; ok {
		copied := *loc
		return &copied, nil
	}
	return nil, sql.ErrNoRows
}

func (m *mockLocRepo7C) IncrementStock(_ context.Context, productID, locationID, qty int) error {
	m.incremented = append(m.incremented, struct{ prodID, locID, qty int }{productID, locationID, qty})
	return nil
}

func (m *mockLocRepo7C) DeductStock(_ context.Context, productID, locationID, qty int) error {
	m.deducted = append(m.deducted, struct{ prodID, locID, qty int }{productID, locationID, qty})
	return nil
}

func (m *mockLocRepo7C) GetStockAtLocation(_ context.Context, _ int, locationID int, lockForUpdate bool) (int, error) {
	if lockForUpdate {
		m.lockForUpdCalls++
	}
	return m.stockByLoc[locationID], nil
}

type mockInvRepo7C struct {
	inventory_port.InvestigationRepository
	dupRows         []domain.DuplicateTransactionItem
	dupCount        int
	movementByID    map[int]*domain.RevertableMovement
	alreadyReverted map[int]bool
	markedIDs       []int
}

func (m *mockInvRepo7C) CountDuplicateGroups(_ context.Context, _ inventory_dto.GetDuplicateTransactionsRequest) (int, error) {
	return m.dupCount, nil
}

func (m *mockInvRepo7C) GetDuplicateGroups(_ context.Context, _ inventory_dto.GetDuplicateTransactionsRequest) ([]domain.DuplicateTransactionItem, error) {
	return m.dupRows, nil
}

func (m *mockInvRepo7C) GetMovementByIDForRevert(_ context.Context, id int) (*domain.RevertableMovement, error) {
	if mov, ok := m.movementByID[id]; ok {
		copied := *mov
		return &copied, nil
	}
	return nil, sql.ErrNoRows
}

func (m *mockInvRepo7C) IsMovementReverted(_ context.Context, id int) (bool, error) {
	return m.alreadyReverted[id], nil
}

func (m *mockInvRepo7C) MarkMovementReverted(_ context.Context, id int) error {
	m.markedIDs = append(m.markedIDs, id)
	return nil
}

func TestReturnUseCase_CreateManualReturn_ValidationLocationAndTx(t *testing.T) {
	ctx := context.Background()
	retRepo := &mockReturnRepo7C{}
	locRepo := &mockLocRepo7C{
		byID: map[int]*domain.Location{
			10: {ImmutableEntity: kernel.ImmutableEntity{ID: 10}, Code: "QA-1"},
		},
	}
	stockRepo := &mockStockRepo7B{}
	uc := usecase.NewReturnUseCase(&mockTxManager{}, retRepo, locRepo, stockRepo)

	// 1. Invalid condition rejected
	if err := uc.CreateManualReturn(ctx, 1, inventory_dto.CreateManualReturnRequest{
		ProductID: 5, Quantity: 2, LocationID: 10, Condition: "BROKEN",
	}); !errors.Is(err, domain.ErrInvalidReturnCondition) {
		t.Fatalf("expected ErrInvalidReturnCondition, got %v", err)
	}

	// 2. Non-existent target location -> ErrLocationNotFound
	if err := uc.CreateManualReturn(ctx, 1, inventory_dto.CreateManualReturnRequest{
		ProductID: 5, Quantity: 2, LocationID: 999, Condition: "GOOD",
	}); !errors.Is(err, domain.ErrLocationNotFound) {
		t.Fatalf("expected ErrLocationNotFound, got %v", err)
	}

	// 3. Valid manual return increments stock and logs MANUAL_RETURN movement
	if err := uc.CreateManualReturn(ctx, 7, inventory_dto.CreateManualReturnRequest{
		ProductID: 5, Quantity: 3, LocationID: 10, Condition: "good", Reference: " INV-1 ", Notes: "  ",
	}); err != nil {
		t.Fatalf("valid CreateManualReturn failed: %v", err)
	}
	if len(retRepo.created) != 1 || retRepo.created[0].Condition != "GOOD" || retRepo.created[0].Notes != nil {
		t.Fatalf("unexpected created manual return: %+v", retRepo.created)
	}
	if len(locRepo.incremented) != 1 || locRepo.incremented[0].qty != 3 || len(stockRepo.movements) != 1 || stockRepo.movements[0].MovementType != "MANUAL_RETURN" {
		t.Fatalf("expected stock increment and MANUAL_RETURN movement, inc=%+v mov=%+v", locRepo.incremented, stockRepo.movements)
	}
}

func TestInvestigationUseCase_GetDuplicateTransactions_OrderAndValidation(t *testing.T) {
	ctx := context.Background()
	now := time.Now()
	noteA := "Sale Ref: INV-AAA (Item 1)"
	noteB := "Sale Ref: INV-BBB (Item 1)"

	invRepo := &mockInvRepo7C{
		dupCount: 2,
		dupRows: []domain.DuplicateTransactionItem{
			{ID: 1, ProductID: 10, SKU: "S1", Quantity: 2, MovementType: "SALE", Notes: &noteB, CreatedAt: now},
			{ID: 2, ProductID: 10, SKU: "S1", Quantity: 2, MovementType: "SALE", Notes: &noteB, CreatedAt: now.Add(time.Second)},
			{ID: 3, ProductID: 20, SKU: "S2", Quantity: 5, MovementType: "SALE", Notes: &noteA, CreatedAt: now},
		},
	}
	uc := usecase.NewInvestigationUseCase(&mockTxManager{}, invRepo, &mockLocRepo7C{}, &mockStockRepo7B{})

	// 1. Invalid regex rejected before hitting DB
	var appErr *apperror.AppError
	if _, err := uc.GetDuplicateTransactions(ctx, inventory_dto.GetDuplicateTransactionsRequest{
		IncludeNotes: "[invalid-regex",
	}); !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR for invalid includeNotes regex, got %v", err)
	}

	// 2. Reversed date range rejected
	if _, err := uc.GetDuplicateTransactions(ctx, inventory_dto.GetDuplicateTransactionsRequest{
		StartDate: "2026-11-28", EndDate: "2026-11-01",
	}); !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR for reversed date range, got %v", err)
	}

	// 3. Deterministic group order preserved (noteB first, noteA second) with TotalTransaction & ExtractedInvoice populated
	res, err := uc.GetDuplicateTransactions(ctx, inventory_dto.GetDuplicateTransactionsRequest{Page: 0, Limit: 0})
	if err != nil {
		t.Fatalf("GetDuplicateTransactions failed: %v", err)
	}
	if len(res.Data) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(res.Data))
	}
	if res.Data[0].ExtractedInvoice == nil || *res.Data[0].ExtractedInvoice != "INV-BBB" || res.Data[0].TotalTransaction != 2 || res.Data[0].Occurrences != 2 {
		t.Fatalf("expected INV-BBB first with 2 transactions/occurrences, got %+v", res.Data[0])
	}
	if res.Data[1].ExtractedInvoice == nil || *res.Data[1].ExtractedInvoice != "INV-AAA" || res.Data[1].TotalTransaction != 1 {
		t.Fatalf("expected INV-AAA second, got %+v", res.Data[1])
	}
	if res.Meta.Page != 1 || res.Meta.Limit != 10 {
		t.Fatalf("expected clamped page=1 limit=10, got %+v", res.Meta)
	}
}

func TestInvestigationUseCase_RevertTransaction_GuardsAndAtomicReversal(t *testing.T) {
	ctx := context.Background()
	locFrom := 1
	locTo := 2
	revertedNote := "Transfer [REVERTED]"
	origNote := "Transfer A->B"

	invRepo := &mockInvRepo7C{
		movementByID: map[int]*domain.RevertableMovement{
			10: {ID: 10, ProductID: 50, Quantity: 5, FromLocationID: &locFrom, ToLocationID: &locTo, MovementType: "REVERSAL", Notes: &origNote},
			11: {ID: 11, ProductID: 50, Quantity: 5, FromLocationID: &locFrom, ToLocationID: &locTo, MovementType: "TRANSFER", Notes: &revertedNote},
			12: {ID: 12, ProductID: 50, Quantity: 5, FromLocationID: &locFrom, ToLocationID: &locTo, MovementType: "TRANSFER", Notes: &origNote},
		},
		alreadyReverted: map[int]bool{},
	}
	locRepo := &mockLocRepo7C{stockByLoc: map[int]int{locTo: 2}} // Only 2 available at destination
	stockRepo := &mockStockRepo7B{}
	uc := usecase.NewInvestigationUseCase(&mockTxManager{}, invRepo, locRepo, stockRepo)

	var appErr *apperror.AppError

	// 1. Rejects reverting a REVERSAL movement
	if err := uc.RevertTransaction(ctx, 10, 9); !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR reverting REVERSAL, got %v", err)
	}

	// 2. Rejects already [REVERTED] movement with 409 Conflict
	if err := uc.RevertTransaction(ctx, 11, 9); !errors.As(err, &appErr) || appErr.Code != "CONFLICT" {
		t.Fatalf("expected CONFLICT reverting [REVERTED] movement, got %v", err)
	}

	// 3. Rejects reversal when ToLocationID has insufficient physical stock (prevents negative stock)
	if err := uc.RevertTransaction(ctx, 12, 9); !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR when destination stock < qty, got %v", err)
	}
	if len(locRepo.deducted) != 0 || len(locRepo.incremented) != 0 {
		t.Fatalf("expected 0 stock mutations on insufficient stock")
	}

	// 4. Succeeds when destination stock >= qty: locks FOR UPDATE, deducts To, increments From, records REVERSAL, marks original
	locRepo.stockByLoc[locTo] = 10
	if err := uc.RevertTransaction(ctx, 12, 9); err != nil {
		t.Fatalf("valid RevertTransaction failed: %v", err)
	}
	if locRepo.lockForUpdCalls < 1 || len(locRepo.deducted) != 1 || locRepo.deducted[0].locID != locTo || len(locRepo.incremented) != 1 || locRepo.incremented[0].locID != locFrom {
		t.Fatalf("unexpected reversal stock ops: locked=%d ded=%+v inc=%+v", locRepo.lockForUpdCalls, locRepo.deducted, locRepo.incremented)
	}
	if len(stockRepo.movements) != 1 || stockRepo.movements[0].MovementType != "REVERSAL" || len(invRepo.markedIDs) != 1 || invRepo.markedIDs[0] != 12 {
		t.Fatalf("expected REVERSAL movement & MarkMovementReverted(12), movs=%+v marked=%+v", stockRepo.movements, invRepo.markedIDs)
	}
}
