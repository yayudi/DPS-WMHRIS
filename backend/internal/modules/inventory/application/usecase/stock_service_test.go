package usecase_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	catalog_dto "github.com/dps-wmhris/backend/internal/modules/catalog/application/dto"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	iam_port "github.com/dps-wmhris/backend/internal/modules/iam/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/xuri/excelize/v2"
)

type stockKey7B struct {
	productID  int
	locationID int
}

type mockStockRepo7B struct {
	inventory_port.StockRepository
	stocks          map[stockKey7B]*domain.StockLocation
	movements       []*domain.StockMovement
	recordErr       error
	returnNilNoRows bool
}

func (m *mockStockRepo7B) GetStockByLocation(_ context.Context, productID int, locationID int) (*domain.StockLocation, error) {
	if s, ok := m.stocks[stockKey7B{productID: productID, locationID: locationID}]; ok {
		copied := *s
		return &copied, nil
	}
	return nil, nil
}

func (m *mockStockRepo7B) UpsertStockLocation(_ context.Context, stock *domain.StockLocation) error {
	if m.stocks == nil {
		m.stocks = make(map[stockKey7B]*domain.StockLocation)
	}
	copied := *stock
	m.stocks[stockKey7B{productID: stock.ProductID, locationID: stock.LocationID}] = &copied
	return nil
}

func (m *mockStockRepo7B) RecordMovement(_ context.Context, movement *domain.StockMovement) error {
	if m.recordErr != nil {
		return m.recordErr
	}
	copied := *movement
	m.movements = append(m.movements, &copied)
	return nil
}

type mockProductRepo7B struct {
	catalog_port.ProductRepository
	bySKU map[string]catalog_dto.ProductDetailResponse
}

func (m *mockProductRepo7B) GetProductMapWithComponents(_ context.Context, _ []string) (map[string]catalog_dto.ProductDetailResponse, error) {
	return m.bySKU, nil
}

type mockUserRepo7B struct {
	iam_port.UserRepository
	allowedLocs map[int]bool
	permCalls   int
}

func (m *mockUserRepo7B) CheckUserLocationPermission(_ context.Context, _ int, locationID int) (bool, error) {
	m.permCalls++
	return m.allowedLocs[locationID], nil
}

type mockLocRepo7BList struct {
	inventory_port.LocationRepository
	locations []domain.Location
}

func (m *mockLocRepo7BList) FindAll(_ context.Context) ([]domain.Location, error) {
	return m.locations, nil
}

type mockStockQueryRepo7B struct {
	inventory_port.StockQueryRepository
	balances []inventory_dto.StockBalanceResponse
}

func (m *mockStockQueryRepo7B) GetBalances(_ context.Context, _ *int, _ *int) ([]inventory_dto.StockBalanceResponse, error) {
	return m.balances, nil
}

func TestStockUseCase_MoveStock_NilSafetyAndPostCommitEvents(t *testing.T) {
	ctx := context.Background()
	fromID := 10
	toID := 20

	stockRepo := &mockStockRepo7B{stocks: map[stockKey7B]*domain.StockLocation{}}
	eb := &mockEventBus{}
	uc := usecase.NewStockUseCase(&mockTxManager{}, stockRepo, &mockProductRepo7B{}, &mockLocRepo7BList{}, &mockUserRepo7B{}, eb)

	// 1. Origin row missing (GetStockByLocation returns (nil, nil)) must return NotFound, NOT panic
	err := uc.MoveStock(ctx, 1, inventory_dto.MoveStockRequest{
		ProductID: 5, Quantity: 3, MovementType: "OUT", FromLocationID: &fromID,
	})
	var appErr *apperror.AppError
	if !errors.As(err, &appErr) || appErr.Code != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND when origin stock row is nil, got %v", err)
	}

	// 2. Destination row missing (GetStockByLocation returns (nil, nil)) creates new row cleanly & publishes event post-commit
	if err := uc.MoveStock(ctx, 1, inventory_dto.MoveStockRequest{
		ProductID: 5, Quantity: 10, MovementType: "RETURN_INBOUND", ToLocationID: &toID,
	}); err != nil {
		t.Fatalf("inbound MoveStock into new location failed: %v", err)
	}
	if got := stockRepo.stocks[stockKey7B{productID: 5, locationID: 20}]; got == nil || got.Quantity != 10 {
		t.Fatalf("expected destination stock=10, got %+v", got)
	}
	if len(eb.publishedEvents) != 1 || eb.publishedEvents[0].Type != "inventory.stock.increased" {
		t.Fatalf("expected 1 post-commit inventory.stock.increased event, got %+v", eb.publishedEvents)
	}

	// 3. Transaction error (RecordMovement fails) must emit 0 ghost events
	stockRepo.recordErr = errors.New("db write error")
	if err := uc.MoveStock(ctx, 1, inventory_dto.MoveStockRequest{
		ProductID: 5, Quantity: 2, MovementType: "INBOUND", ToLocationID: &toID,
	}); err == nil {
		t.Fatal("expected error when RecordMovement fails")
	}
	if len(eb.publishedEvents) != 1 {
		t.Fatalf("expected 0 new events on rollback, got total=%d", len(eb.publishedEvents))
	}

	// 4. Self-transfer rejected
	stockRepo.recordErr = nil
	if err := uc.MoveStock(ctx, 1, inventory_dto.MoveStockRequest{
		ProductID: 5, Quantity: 1, MovementType: "TRANSFER", FromLocationID: &toID, ToLocationID: &toID,
	}); !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR on self-transfer, got %v", err)
	}
}

func TestStockUseCase_ProcessBatchMovements_TransferInNegativeQtyAndRBAC(t *testing.T) {
	ctx := context.Background()
	locA := 1
	locB := 2

	stockRepo := &mockStockRepo7B{
		stocks: map[stockKey7B]*domain.StockLocation{
			{productID: 100, locationID: locA}: {ProductID: 100, LocationID: locA, Quantity: 20},
		},
	}
	prodRepo := &mockProductRepo7B{
		bySKU: map[string]catalog_dto.ProductDetailResponse{
			"SKU-1": {ID: 100, SKU: "SKU-1"},
		},
	}
	userRepo := &mockUserRepo7B{allowedLocs: map[int]bool{locA: false}}
	eb := &mockEventBus{}
	uc := usecase.NewStockUseCase(&mockTxManager{}, stockRepo, prodRepo, &mockLocRepo7BList{}, userRepo, eb)

	// 1. TRANSFER_IN succeeds and credits destination
	if err := uc.ProcessBatchMovements(ctx, inventory_dto.BatchProcessRequest{
		Type:         "TRANSFER_IN",
		ToLocationID: &locB,
		Movements:    []inventory_dto.BatchMovementRequest{{SKU: "sku-1", Quantity: 7}},
	}, 9, 4); err != nil {
		t.Fatalf("TRANSFER_IN failed: %v", err)
	}
	if got := stockRepo.stocks[stockKey7B{productID: 100, locationID: locB}]; got == nil || got.Quantity != 7 {
		t.Fatalf("expected destination qty=7 after TRANSFER_IN, got %+v", got)
	}
	if len(stockRepo.movements) != 1 || stockRepo.movements[0].MovementType != "TRANSFER_IN" {
		t.Fatalf("expected TRANSFER_IN movement logged, got %+v", stockRepo.movements)
	}

	// 2. Negative qty on INBOUND rejected
	var appErr *apperror.AppError
	if err := uc.ProcessBatchMovements(ctx, inventory_dto.BatchProcessRequest{
		Type:         "INBOUND",
		ToLocationID: &locB,
		Movements:    []inventory_dto.BatchMovementRequest{{SKU: "SKU-1", Quantity: -5}},
	}, 9, 1); !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected VALIDATION_ERROR for negative INBOUND qty, got %v", err)
	}

	// 3. Non-admin ADJUSTMENT using FromLocationID enforces CheckUserLocationPermission
	if err := uc.ProcessBatchMovements(ctx, inventory_dto.BatchProcessRequest{
		Type:           "ADJUSTMENT",
		FromLocationID: &locA,
		Movements:      []inventory_dto.BatchMovementRequest{{SKU: "SKU-1", Quantity: -3}},
	}, 9, 4); !errors.As(err, &appErr) || appErr.Code != "FORBIDDEN" {
		t.Fatalf("expected FORBIDDEN for unauthorized non-admin ADJUSTMENT via FromLocationID, got %v", err)
	}
	if userRepo.permCalls != 1 {
		t.Fatalf("expected 1 permission check, got %d", userRepo.permCalls)
	}
}

func TestStockUseCase_ProcessStockImport_PositiveSignedMovements(t *testing.T) {
	ctx := context.Background()
	tmpPath := filepath.Join(t.TempDir(), "opname.xlsx")

	f := excelize.NewFile()
	_ = f.SetCellValue("Sheet1", "A1", "SKU")
	_ = f.SetCellValue("Sheet1", "B1", "LT (Lokasi)")
	_ = f.SetCellValue("Sheet1", "C1", "ACTUAL")
	_ = f.SetCellValue("Sheet1", "A2", "SKU-1")
	_ = f.SetCellValue("Sheet1", "B2", "LOC-1")
	_ = f.SetCellValue("Sheet1", "C2", "5") // Current 10 -> ADJUST_MINUS qty=5 from LOC-1
	_ = f.SetCellValue("Sheet1", "A3", "SKU-2")
	_ = f.SetCellValue("Sheet1", "B3", "LOC-1")
	_ = f.SetCellValue("Sheet1", "C3", "8") // Current 0 -> ADJUST_PLUS qty=8 to LOC-1
	if err := f.SaveAs(tmpPath); err != nil {
		t.Fatalf("SaveAs failed: %v", err)
	}
	_ = f.Close()

	stockRepo := &mockStockRepo7B{
		stocks: map[stockKey7B]*domain.StockLocation{
			{productID: 1, locationID: 10}: {ProductID: 1, LocationID: 10, Quantity: 10},
		},
	}
	prodRepo := &mockProductRepo7B{
		bySKU: map[string]catalog_dto.ProductDetailResponse{
			"SKU-1": {ID: 1, SKU: "SKU-1"},
			"SKU-2": {ID: 2, SKU: "SKU-2"},
		},
	}
	locRepo := &mockLocRepo7BList{
		locations: []domain.Location{{ImmutableEntity: kernel.ImmutableEntity{ID: 10}, Code: "LOC-1"}},
	}
	eb := &mockEventBus{}
	uc := usecase.NewStockUseCase(&mockTxManager{}, stockRepo, prodRepo, locRepo, &mockUserRepo7B{}, eb)

	if _, err := uc.ProcessStockImport(ctx, 1, tmpPath, 7, false); err != nil {
		t.Fatalf("ProcessStockImport failed: %v", err)
	}
	if len(stockRepo.movements) != 2 {
		t.Fatalf("expected 2 movements, got %d", len(stockRepo.movements))
	}
	m0, m1 := stockRepo.movements[0], stockRepo.movements[1]
	if m0.MovementType != "ADJUST_MINUS" || m0.Quantity != 5 || m0.FromLocationID == nil || *m0.FromLocationID != 10 || m0.ToLocationID != nil {
		t.Fatalf("expected positive ADJUST_MINUS from LOC-1, got %+v", m0)
	}
	if m1.MovementType != "ADJUST_PLUS" || m1.Quantity != 8 || m1.ToLocationID == nil || *m1.ToLocationID != 10 || m1.FromLocationID != nil {
		t.Fatalf("expected positive ADJUST_PLUS to LOC-1, got %+v", m1)
	}
	// Only ADJUST_PLUS (toLoc != nil) emits inventory.stock.increased
	if len(eb.publishedEvents) != 1 {
		t.Fatalf("expected 1 stock.increased event (only for ADJUST_PLUS), got %d", len(eb.publishedEvents))
	}
}

func TestStockQueryService_GetStockBalances(t *testing.T) {
	qRepo := &mockStockQueryRepo7B{
		balances: []inventory_dto.StockBalanceResponse{{LocationID: 1, ProductID: 2, Quantity: 10, ReservedQuantity: 3, AvailableQuantity: 7}},
	}
	svc := usecase.NewStockQueryService(qRepo)
	got, err := svc.GetStockBalances(context.Background(), nil, nil)
	if err != nil || len(got) != 1 || got[0].AvailableQuantity != 7 {
		t.Fatalf("unexpected balances: %+v err=%v", got, err)
	}
}
