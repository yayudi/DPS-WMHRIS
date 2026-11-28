package usecase_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/apperror"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
	"github.com/go-sql-driver/mysql"
)

type mockLocationRepo7A struct {
	inventory_port.LocationRepository
	byID             map[int]*domain.Location
	createErr        error
	updateErr        error
	softDeleteErr    error
	toggleErr        error
	toggledFlag      bool
	createdLocations []*domain.Location
}

func (m *mockLocationRepo7A) FindAll(_ context.Context) ([]domain.Location, error) {
	return nil, nil
}

func (m *mockLocationRepo7A) FindByID(_ context.Context, id int) (*domain.Location, error) {
	if loc, ok := m.byID[id]; ok {
		copied := *loc
		return &copied, nil
	}
	return nil, sql.ErrNoRows
}

func (m *mockLocationRepo7A) Create(_ context.Context, loc *domain.Location) error {
	if m.createErr != nil {
		return m.createErr
	}
	loc.ID = len(m.createdLocations) + 1
	copied := *loc
	m.createdLocations = append(m.createdLocations, &copied)
	return nil
}

func (m *mockLocationRepo7A) Update(_ context.Context, loc *domain.Location) error {
	if m.updateErr != nil {
		return m.updateErr
	}
	if m.byID != nil {
		copied := *loc
		m.byID[loc.ID] = &copied
	}
	return nil
}

func (m *mockLocationRepo7A) SoftDelete(_ context.Context, _ int) error {
	return m.softDeleteErr
}

func (m *mockLocationRepo7A) UpdateFulfillmentSourceFlag(_ context.Context, _ int, flag bool) error {
	m.toggledFlag = flag
	return m.toggleErr
}

func (m *mockLocationRepo7A) GetStockSample(_ context.Context, _ int) ([]inventory_dto.StockSampleResponse, error) {
	return nil, nil
}

type mockStockRequestRepo7A struct {
	inventory_port.StockRequestRepository
	byID                 map[int]*domain.StockRequest
	allRequests          []domain.StockRequest
	itemsByReqID         map[int][]domain.StockRequestItem
	updatedStatuses      map[int]string
	receivedByItem       map[int]int
	findItemsSingleCalls int
	findItemsBatchCalls  int
}

func (m *mockStockRequestRepo7A) FindByID(_ context.Context, id int) (*domain.StockRequest, error) {
	if req, ok := m.byID[id]; ok {
		copied := *req
		// Simulate BaseRepository behavior: Items is db:"-" and NEVER loaded by FindByID!
		copied.Items = nil
		return &copied, nil
	}
	return nil, sql.ErrNoRows
}

func (m *mockStockRequestRepo7A) FindItemsByRequestID(_ context.Context, reqID int) ([]domain.StockRequestItem, error) {
	m.findItemsSingleCalls++
	return m.itemsByReqID[reqID], nil
}

func (m *mockStockRequestRepo7A) FindItemsByRequestIDs(_ context.Context, reqIDs []int) (map[int][]domain.StockRequestItem, error) {
	m.findItemsBatchCalls++
	out := make(map[int][]domain.StockRequestItem, len(reqIDs))
	for _, id := range reqIDs {
		if items, ok := m.itemsByReqID[id]; ok {
			out[id] = items
		}
	}
	return out, nil
}

func (m *mockStockRequestRepo7A) CreateTx(_ context.Context, req *domain.StockRequest) error {
	req.ID = 100
	return nil
}

func (m *mockStockRequestRepo7A) CreateItemTx(_ context.Context, item *domain.StockRequestItem) error {
	item.ID = 200
	return nil
}

func (m *mockStockRequestRepo7A) UpdateStatusTx(_ context.Context, id int, status string) error {
	if m.updatedStatuses == nil {
		m.updatedStatuses = make(map[int]string)
	}
	m.updatedStatuses[id] = status
	if r, ok := m.byID[id]; ok {
		r.Status = status
	}
	return nil
}

func (m *mockStockRequestRepo7A) UpdateItemReceivedQtyTx(_ context.Context, itemID int, qty int) error {
	if m.receivedByItem == nil {
		m.receivedByItem = make(map[int]int)
	}
	m.receivedByItem[itemID] = qty
	return nil
}

func (m *mockStockRequestRepo7A) FindAllWithJoins(_ context.Context) ([]domain.StockRequest, error) {
	out := make([]domain.StockRequest, len(m.allRequests))
	copy(out, m.allRequests)
	return out, nil
}

type mockStockUseCase7A struct {
	inventory_port.StockUseCase
	batchCalls []struct {
		req    inventory_dto.BatchProcessRequest
		userID int
		roleID int
	}
}

func (m *mockStockUseCase7A) ProcessBatchMovements(_ context.Context, req inventory_dto.BatchProcessRequest, userID int, userRoleID int) error {
	m.batchCalls = append(m.batchCalls, struct {
		req    inventory_dto.BatchProcessRequest
		userID int
		roleID int
	}{req: req, userID: userID, roleID: userRoleID})
	return nil
}

type mockNotifService7A struct {
	system_port.NotificationService
	calls int
}

func (m *mockNotifService7A) NotifyUsersByPermission(_ context.Context, _, _, _, _ string, _ any, _ *int, _ bool) error {
	m.calls++
	return nil
}

func TestLocationUseCase_ValidationTxDuplicateAndNotFound(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockSCTxManager{}
	bus := &mockAuditEventBus{}
	repo := &mockLocationRepo7A{
		byID: map[int]*domain.Location{
			1: {ImmutableEntity: kernel.ImmutableEntity{ID: 1}, Code: "A1", Building: "B1", Purpose: "DISPLAY", IsActive: true, IsFulfillmentSource: true},
		},
	}
	uc := usecase.NewLocationUseCase(txMgr, repo, bus)

	trueVal := true

	// 1. Rejects creating BAD_STOCK location with is_fulfillment_source=true
	_, err := uc.CreateLocation(ctx, 1, inventory_dto.CreateLocationRequest{
		Code: "BS-1", Building: "B1", Purpose: "BAD_STOCK", IsActive: &trueVal, IsFulfillmentSource: &trueVal,
	})
	var appErr *apperror.AppError
	if !errors.As(err, &appErr) || appErr.Code != "VALIDATION_ERROR" {
		t.Fatalf("expected validation error for BAD_STOCK fulfillment source, got %v", err)
	}

	// 2. Maps MySQL 1062 duplicate code -> ErrDuplicateLocationCode
	repo.createErr = &mysql.MySQLError{Number: 1062, Message: "Duplicate entry"}
	if _, err := uc.CreateLocation(ctx, 1, inventory_dto.CreateLocationRequest{
		Code: "A1", Building: "B1", Purpose: "DISPLAY", IsActive: &trueVal,
	}); !errors.Is(err, domain.ErrDuplicateLocationCode) {
		t.Fatalf("expected ErrDuplicateLocationCode, got %v", err)
	}
	repo.createErr = nil

	// 3. Valid create runs inside txManager and publishes structured audit log
	loc, err := uc.CreateLocation(ctx, 1, inventory_dto.CreateLocationRequest{
		Code: " D-01 ", Building: " G1 ", Name: `Rak "Utama"`, Purpose: "DISPLAY", IsActive: &trueVal,
	})
	if err != nil || loc.Code != "D-01" || !loc.IsFulfillmentSource || txMgr.calls != 2 || len(bus.published) != 1 {
		t.Fatalf("unexpected create result: loc=%+v tx=%d events=%d err=%v", loc, txMgr.calls, len(bus.published), err)
	}

	// 4. UpdateLocation & ToggleFulfillmentSource map sql.ErrNoRows -> ErrLocationNotFound
	if err := uc.ToggleFulfillmentSource(ctx, 1, 999, true); !errors.Is(err, domain.ErrLocationNotFound) {
		t.Fatalf("expected ErrLocationNotFound on missing toggle, got %v", err)
	}
	if err := uc.DeleteLocation(ctx, 1, 999); !errors.Is(err, domain.ErrLocationNotFound) {
		t.Fatalf("expected ErrLocationNotFound on missing delete, got %v", err)
	}
}

func TestStockRequestUseCase_LoadsItemsAndPropagatesRealRoleID(t *testing.T) {
	ctx := context.Background()
	txMgr := &mockSCTxManager{}
	fromLoc := 10
	toLoc := 20
	srRepo := &mockStockRequestRepo7A{
		byID: map[int]*domain.StockRequest{
			1: {
				BaseEntity:     kernel.BaseEntity{ID: 1},
				RequestNumber:  "SR-261127-1001",
				Type:           domain.StockRequestTypeTransfer,
				RequesterID:    5,
				FromLocationID: &fromLoc,
				ToLocationID:   &toLoc,
				Status:         domain.StockRequestStatusPending,
			},
			2: {
				BaseEntity:    kernel.BaseEntity{ID: 2},
				RequestNumber: "SR-261127-1002",
				Type:          domain.StockRequestTypeStockOpname,
				RequesterID:   5,
				ToLocationID:  &toLoc,
				Status:        domain.StockRequestStatusPending,
			},
		},
		itemsByReqID: map[int][]domain.StockRequestItem{
			1: {{ID: 11, StockRequestID: 1, ProductID: 50, SKU: "SKU-50", Quantity: 8}},
			2: {{ID: 22, StockRequestID: 2, ProductID: 60, SKU: "SKU-60", Quantity: 12}},
		},
	}
	stockSvc := &mockStockUseCase7A{}
	notifSvc := &mockNotifService7A{}
	uc := usecase.NewStockRequestUseCase(txMgr, srRepo, stockSvc, notifSvc)

	// 1. Transfer flow: Approve -> Dispatch (must load items & pass real roleID=4, NOT hardcoded 1!) -> Complete
	if err := uc.ApproveStockRequest(ctx, 1, 9, 4); err != nil {
		t.Fatalf("Approve transfer failed: %v", err)
	}
	if srRepo.updatedStatuses[1] != domain.StockRequestStatusApproved {
		t.Fatalf("expected APPROVED status, got %q", srRepo.updatedStatuses[1])
	}

	if err := uc.DispatchStockRequest(ctx, 1, 9, 4); err != nil {
		t.Fatalf("Dispatch transfer failed: %v", err)
	}
	if len(stockSvc.batchCalls) != 1 || len(stockSvc.batchCalls[0].req.Movements) != 1 || stockSvc.batchCalls[0].roleID != 4 || stockSvc.batchCalls[0].req.Type != "TRANSFER_OUT" {
		t.Fatalf("Dispatch must execute TRANSFER_OUT for loaded item with real roleID=4, got %+v", stockSvc.batchCalls)
	}

	if err := uc.CompleteStockRequest(ctx, 1, inventory_dto.CompleteStockRequest{
		ReceivedItems: []inventory_dto.CompleteStockRequestItem{{ProductID: 50, ReceivedQuantity: 7}},
	}, 9, 4); err != nil {
		t.Fatalf("Complete transfer failed: %v", err)
	}
	if len(stockSvc.batchCalls) != 2 || len(stockSvc.batchCalls[1].req.Movements) != 1 || stockSvc.batchCalls[1].req.Movements[0].Quantity != 7 || stockSvc.batchCalls[1].roleID != 4 {
		t.Fatalf("Complete must execute TRANSFER_IN with received qty=7 and real roleID=4, got %+v", stockSvc.batchCalls)
	}
	if srRepo.receivedByItem[11] != 7 || srRepo.updatedStatuses[1] != domain.StockRequestStatusCompleted {
		t.Fatalf("expected item 11 received=7 & status COMPLETED, got qty=%d status=%q", srRepo.receivedByItem[11], srRepo.updatedStatuses[1])
	}

	// 2. Stock Opname approval must load items & execute ADJUSTMENT
	if err := uc.ApproveStockRequest(ctx, 2, 9, 4); err != nil {
		t.Fatalf("Approve opname failed: %v", err)
	}
	if len(stockSvc.batchCalls) != 3 || stockSvc.batchCalls[2].req.Type != "ADJUSTMENT" || len(stockSvc.batchCalls[2].req.Movements) != 1 {
		t.Fatalf("Opname approval must execute ADJUSTMENT with loaded item, got %+v", stockSvc.batchCalls)
	}

	// 3. Invalid type on Create rejected
	if _, err := uc.CreateStockRequest(ctx, 5, inventory_dto.CreateStockRequest{
		Type: "UNKNOWN", Items: []inventory_dto.CreateStockRequestItem{{ProductID: 1, Quantity: 1}},
	}); !errors.Is(err, domain.ErrInvalidStockRequestType) {
		t.Fatalf("expected ErrInvalidStockRequestType, got %v", err)
	}
}

func TestStockRequestUseCase_GetAllBatchLoadsItemsNoNPlusOne(t *testing.T) {
	ctx := context.Background()
	srRepo := &mockStockRequestRepo7A{
		allRequests: []domain.StockRequest{
			{BaseEntity: kernel.BaseEntity{ID: 10}, RequestNumber: "SR-1"},
			{BaseEntity: kernel.BaseEntity{ID: 20}, RequestNumber: "SR-2"},
		},
		itemsByReqID: map[int][]domain.StockRequestItem{
			10: {{ID: 1, StockRequestID: 10, ProductID: 100, SKU: "SKU-1", Quantity: 3}},
		},
	}
	uc := usecase.NewStockRequestUseCase(&mockSCTxManager{}, srRepo, &mockStockUseCase7A{}, &mockNotifService7A{})

	reqs, err := uc.GetAllStockRequests(ctx)
	if err != nil {
		t.Fatalf("GetAllStockRequests failed: %v", err)
	}
	if srRepo.findItemsBatchCalls != 1 || srRepo.findItemsSingleCalls != 0 {
		t.Fatalf("expected 1 batch call and 0 N+1 single calls, got batch=%d single=%d", srRepo.findItemsBatchCalls, srRepo.findItemsSingleCalls)
	}
	if len(reqs) != 2 || len(reqs[0].Items) != 1 || reqs[1].Items == nil || len(reqs[1].Items) != 0 {
		t.Fatalf("unexpected attached items: req0=%+v req1=%+v", reqs[0].Items, reqs[1].Items)
	}
}
