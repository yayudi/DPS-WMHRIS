package usecase_test

import (
	"context"
	"sort"
	"testing"
	"time"

	catalog_domain "github.com/dps-wmhris/backend/internal/modules/catalog/domain"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type mockSlotTxManager struct{}

func (m *mockSlotTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

type mockSlotRepo struct {
	slots map[int]*domain.ProductLocationSlot
	logs  []domain.ProductLocationSlotLog
}

func newMockSlotRepo() *mockSlotRepo {
	return &mockSlotRepo{
		slots: make(map[int]*domain.ProductLocationSlot),
		logs:  make([]domain.ProductLocationSlotLog, 0),
	}
}

func (m *mockSlotRepo) GetSlots(ctx context.Context, productID int, locationID int) ([]domain.ProductLocationSlot, error) {
	var result []domain.ProductLocationSlot
	for _, s := range m.slots {
		if s.ProductID == productID && s.LocationID == locationID {
			result = append(result, *s)
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].IsPrimary != result[j].IsPrimary {
			return result[i].IsPrimary
		}
		return result[i].ID < result[j].ID
	})
	return result, nil
}

func (m *mockSlotRepo) GetSlotByID(ctx context.Context, id int) (*domain.ProductLocationSlot, error) {
	if s, exists := m.slots[id]; exists {
		return s, nil
	}
	return nil, nil
}

func (m *mockSlotRepo) CreateSlot(ctx context.Context, slot *domain.ProductLocationSlot) error {
	slot.ID = len(m.slots) + 1
	m.slots[slot.ID] = slot
	return nil
}

func (m *mockSlotRepo) UpdateSlot(ctx context.Context, slot *domain.ProductLocationSlot) error {
	m.slots[slot.ID] = slot
	return nil
}

func (m *mockSlotRepo) DeleteSlot(ctx context.Context, id int) error {
	delete(m.slots, id)
	return nil
}

func (m *mockSlotRepo) SetPrimarySlot(ctx context.Context, productID int, locationID int, slotID int) error {
	for _, s := range m.slots {
		if s.ProductID == productID && s.LocationID == locationID {
			s.IsPrimary = (s.ID == slotID)
		}
	}
	return nil
}

func (m *mockSlotRepo) CreateSlotLog(ctx context.Context, log *domain.ProductLocationSlotLog) error {
	log.ID = len(m.logs) + 1
	m.logs = append(m.logs, *log)
	return nil
}

func (m *mockSlotRepo) GetSlotLogs(ctx context.Context, productID int, locationID int, limit int, offset int) ([]domain.ProductLocationSlotLog, int, error) {
	var result []domain.ProductLocationSlotLog
	for _, l := range m.logs {
		if l.ProductID == productID && l.LocationID == locationID {
			result = append(result, l)
		}
	}
	return result, len(result), nil
}

func (m *mockSlotRepo) GetSlotsByProductAndLocations(ctx context.Context, productID int, locationIDs []int) (map[int][]domain.ProductLocationSlot, error) {
	res := make(map[int][]domain.ProductLocationSlot)
	for _, s := range m.slots {
		if s.ProductID == productID {
			for _, locID := range locationIDs {
				if s.LocationID == locID {
					res[locID] = append(res[locID], *s)
				}
			}
		}
	}
	return res, nil
}

type mockSlotTrxRepo struct {
	inventory_port.StockTransactionRepository
	trxs map[string]*domain.StockTransaction
}

func (m *mockSlotTrxRepo) GetByID(ctx context.Context, id uint) (*domain.StockTransaction, error) {
	for _, t := range m.trxs {
		if t.ID == id {
			return t, nil
		}
	}
	return nil, nil
}

func (m *mockSlotTrxRepo) GetByReference(ctx context.Context, refType string, refID string) (*domain.StockTransaction, error) {
	if t, exists := m.trxs[refID]; exists {
		return t, nil
	}
	return nil, nil
}

type mockSlotLocRepo struct {
	inventory_port.LocationRepository
	locations map[int]*domain.Location
}

func (m *mockSlotLocRepo) FindByID(ctx context.Context, id int) (*domain.Location, error) {
	if loc, ok := m.locations[id]; ok {
		return loc, nil
	}
	return nil, nil
}

func (m *mockSlotLocRepo) FindAvailableStockLocations(ctx context.Context, productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
	return []domain.AvailableLocationStock{
		{LocationID: 10, AvailableQuantity: 50},
	}, nil
}

func (m *mockSlotLocRepo) FindFulfillmentSourceStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error) {
	return []domain.AvailableLocationStock{
		{LocationID: 10, AvailableQuantity: 50},
	}, nil
}

type mockSlotProductRepo struct {
	catalog_port.ProductRepository
	products map[int]*catalog_domain.Product
}

func (m *mockSlotProductRepo) FindByID(ctx context.Context, id int) (*catalog_domain.Product, error) {
	if p, ok := m.products[id]; ok {
		return p, nil
	}
	return nil, nil
}

func TestSlotService_MultiRack_AddDeletePrimary(t *testing.T) {
	txManager := &mockSlotTxManager{}
	slotRepo := newMockSlotRepo()
	trxRepo := &mockSlotTrxRepo{trxs: make(map[string]*domain.StockTransaction)}
	locRepo := &mockSlotLocRepo{locations: make(map[int]*domain.Location)}
	productRepo := &mockSlotProductRepo{products: make(map[int]*catalog_domain.Product)}

	svc := usecase.NewSlotUseCase(txManager, slotRepo, trxRepo, locRepo, productRepo)
	ctx := context.Background()
	tier1 := "T3"

	// 1. Initial Assignment: 1st Rack
	req1 := inventory_dto.UpsertSlotRequest{
		ProductID:  101,
		LocationID: 10,
		Room:       "R.UTAMA",
		Rack:       "B-02",
		Tier:       &tier1,
	}

	res1, err := svc.AddSlot(ctx, 1, req1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res1.FormattedCoordinate != "R.UTAMA - B-02 - T3" {
		t.Errorf("expected 'R.UTAMA - B-02 - T3', got '%s'", res1.FormattedCoordinate)
	}
	if !res1.IsPrimary {
		t.Errorf("first slot should be primary")
	}
	if len(slotRepo.logs) != 1 || slotRepo.logs[0].Action != domain.SlotActionInitialAssign {
		t.Errorf("expected INITIAL_ASSIGN log")
	}

	// 2. Add 2nd Rack (Buffer/Secondary)
	tier2 := "T1"
	req2 := inventory_dto.UpsertSlotRequest{
		ProductID:  101,
		LocationID: 10,
		Room:       "R.BUFFER",
		Rack:       "C-05",
		Tier:       &tier2,
		IsPrimary:  false,
	}

	res2, err := svc.AddSlot(ctx, 1, req2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res2.FormattedCoordinate != "R.BUFFER - C-05 - T1" {
		t.Errorf("expected 'R.BUFFER - C-05 - T1', got '%s'", res2.FormattedCoordinate)
	}
	if res2.IsPrimary {
		t.Errorf("second slot should be secondary")
	}
	if len(slotRepo.logs) != 2 || slotRepo.logs[1].Action != domain.SlotActionAdded {
		t.Errorf("expected ADDED log")
	}

	// 3. GetSlots returns 2 slots
	allSlots, err := svc.GetSlots(ctx, 101, 10)
	if err != nil || len(allSlots) != 2 {
		t.Fatalf("expected 2 slots, got %d", len(allSlots))
	}

	// 4. Set 2nd Rack as Primary
	err = svc.SetPrimarySlot(ctx, 1, 101, 10, res2.ID)
	if err != nil {
		t.Fatalf("unexpected error setting primary: %v", err)
	}

	// 5. Delete 1st Rack
	err = svc.DeleteSlot(ctx, 1, res1.ID, nil)
	if err != nil {
		t.Fatalf("unexpected error deleting slot: %v", err)
	}
	remainingSlots, err := svc.GetSlots(ctx, 101, 10)
	if err != nil || len(remainingSlots) != 1 {
		t.Fatalf("expected 1 remaining slot, got %d", len(remainingSlots))
	}
	if remainingSlots[0].ID != res2.ID {
		t.Errorf("expected slot 2 to remain")
	}
}

func TestSlotService_GetPickingLocationsForKelja(t *testing.T) {
	txManager := &mockSlotTxManager{}
	slotRepo := newMockSlotRepo()
	trxRepo := &mockSlotTrxRepo{trxs: make(map[string]*domain.StockTransaction)}
	floor := 1
	locRepo := &mockSlotLocRepo{
		locations: map[int]*domain.Location{
			10: {ImmutableEntity: kernel.ImmutableEntity{ID: 10}, Code: "A12-1", Building: "A12", Floor: &floor},
		},
	}
	p101 := &catalog_domain.Product{
		SKU:  "SKU-SEPATU-42",
		Name: "Sepatu Running 42",
	}
	p101.ID = 101
	productRepo := &mockSlotProductRepo{
		products: map[int]*catalog_domain.Product{
			101: p101,
		},
	}

	orderCode := "ORD-202610-001"
	trxRepo.trxs[orderCode] = &domain.StockTransaction{
		ID:               1,
		TransactionNo:    "TRX-001",
		ReferenceID:      orderCode,
		ReferenceType:    "KELJA_FULFILLMENT",
		AssignedBuilding: "A12",
		Status:           domain.TransactionStatusReadyToPick,
		Movements: []*domain.TransactionMovement{
			{ID: 1, ProductID: 101, TargetQuantity: 2, Status: "PENDING", CreatedAt: time.Now()},
		},
	}

	svc := usecase.NewSlotUseCase(txManager, slotRepo, trxRepo, locRepo, productRepo)
	ctx := context.Background()

	// Assign primary and secondary slots
	tier := "T2"
	_, _ = svc.AddSlot(ctx, 1, inventory_dto.UpsertSlotRequest{
		ProductID:  101,
		LocationID: 10,
		Room:       "R.UTAMA",
		Rack:       "B-02",
		Tier:       &tier,
		IsPrimary:  true,
	})
	tierBuffer := "T1"
	_, _ = svc.AddSlot(ctx, 1, inventory_dto.UpsertSlotRequest{
		ProductID:  101,
		LocationID: 10,
		Room:       "R.CADANGAN",
		Rack:       "C-01",
		Tier:       &tierBuffer,
		IsPrimary:  false,
	})

	// Resolve picking locations
	resp, err := svc.GetPickingLocationsForKelja(ctx, orderCode)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}
	item := resp.Items[0]
	if !item.Slotting.IsSlotted {
		t.Fatalf("expected item to be slotted")
	}
	if *item.Slotting.FormattedCoordinate != "R.UTAMA - B-02 - T2" {
		t.Errorf("expected 'R.UTAMA - B-02 - T2', got '%s'", *item.Slotting.FormattedCoordinate)
	}
	if len(item.Slotting.AllCoordinates) != 2 {
		t.Errorf("expected 2 coordinates in AllCoordinates, got %d", len(item.Slotting.AllCoordinates))
	}
	if item.Location.Code != "A12-1" {
		t.Errorf("expected location code 'A12-1', got '%s'", item.Location.Code)
	}
}
