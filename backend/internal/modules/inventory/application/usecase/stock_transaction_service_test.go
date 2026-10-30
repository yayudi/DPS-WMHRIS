package usecase_test

import (
	"context"
	"strings"
	"testing"
	"time"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/dps-wmhris/backend/internal/shared/kernel"
)

type mockTxManager struct{}

func (m *mockTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

type mockTrxRepo struct {
	inventory_port.StockTransactionRepository
	createTxFn      func(ctx context.Context, trx *domain.StockTransaction) error
	createdTrx      *domain.StockTransaction
	getByIDTrx      *domain.StockTransaction
	getByRefTrx     *domain.StockTransaction
	savedFulfillTx  *domain.StockTransaction
	getHeldTrx      []domain.StockTransaction
	updateTrxCalled bool
	updatedTrx      *domain.StockTransaction
}

func (m *mockTrxRepo) CreateTx(ctx context.Context, trx *domain.StockTransaction) error {
	if m.createTxFn != nil {
		return m.createTxFn(ctx, trx)
	}
	m.createdTrx = trx
	return nil
}

func (m *mockTrxRepo) GetByID(ctx context.Context, id uint) (*domain.StockTransaction, error) {
	return m.getByIDTrx, nil
}

func (m *mockTrxRepo) GetByReference(ctx context.Context, referenceType, referenceID string) (*domain.StockTransaction, error) {
	return m.getByRefTrx, nil
}

func (m *mockTrxRepo) SaveFulfillmentTx(ctx context.Context, trx *domain.StockTransaction) error {
	m.savedFulfillTx = trx
	return nil
}

func (m *mockTrxRepo) GetHeldTransactions(ctx context.Context, building string) ([]domain.StockTransaction, error) {
	if building != "" {
		var filtered []domain.StockTransaction
		for _, t := range m.getHeldTrx {
			if t.AssignedBuilding == building {
				filtered = append(filtered, t)
			}
		}
		return filtered, nil
	}
	return m.getHeldTrx, nil
}

func (m *mockTrxRepo) UpdateTransactionTx(ctx context.Context, trx *domain.StockTransaction) error {
	m.updateTrxCalled = true
	m.updatedTrx = trx
	return nil
}

type mockLocRepo struct {
	inventory_port.LocationRepository
	availLocs        []domain.AvailableLocationStock
	availLocsFn      func(productID int, purpose string, building string) ([]domain.AvailableLocationStock, error)
	capturedPurpose        string
	capturedBuilding       string
	fulfillmentStockCalled bool
	findByIDLoc            *domain.Location
	reservedCalls    []struct {
		productID  int
		locationID int
		qty        int
	}
	releasedCalls []struct {
		productID  int
		locationID int
		qty        int
	}
	deductedCalls []struct {
		productID  int
		locationID int
		qty        int
	}
}

func (m *mockLocRepo) FindByID(ctx context.Context, id int) (*domain.Location, error) {
	return m.findByIDLoc, nil
}

func (m *mockLocRepo) FindAvailableStockLocations(ctx context.Context, productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
	m.capturedPurpose = purpose
	m.capturedBuilding = building
	if m.availLocsFn != nil {
		return m.availLocsFn(productID, purpose, building)
	}
	return m.availLocs, nil
}

func (m *mockLocRepo) FindFulfillmentSourceStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error) {
	m.fulfillmentStockCalled = true
	if m.availLocsFn != nil {
		return m.availLocsFn(productID, "DISPLAY", "")
	}
	return m.availLocs, nil
}

func (m *mockLocRepo) FindReplenishmentCandidateStock(ctx context.Context, productID int) ([]domain.AvailableLocationStock, error) {
	if m.availLocsFn != nil {
		return m.availLocsFn(productID, "STORAGE", "")
	}
	return m.availLocs, nil
}

func (m *mockLocRepo) UpdateFulfillmentSourceFlag(ctx context.Context, locationID int, isFulfillmentSource bool) error {
	return nil
}

func (m *mockLocRepo) ReserveStock(ctx context.Context, productID int, locationID int, qty int) error {
	m.reservedCalls = append(m.reservedCalls, struct {
		productID  int
		locationID int
		qty        int
	}{productID, locationID, qty})
	return nil
}

func (m *mockLocRepo) ReleaseStock(ctx context.Context, productID int, locationID int, qty int) error {
	m.releasedCalls = append(m.releasedCalls, struct {
		productID  int
		locationID int
		qty        int
	}{productID, locationID, qty})
	return nil
}

func (m *mockLocRepo) DeductStock(ctx context.Context, productID int, locationID int, qty int) error {
	m.deductedCalls = append(m.deductedCalls, struct {
		productID  int
		locationID int
		qty        int
	}{productID, locationID, qty})
	return nil
}

type mockOutboxRepo struct {
	savedEvents       []*domain.OutboxEvent
	pendingEvents     []domain.OutboxEvent
	publishedIDs      []int64
	incrementedIDs    []int64
}

func (m *mockOutboxRepo) SaveTx(ctx context.Context, event *domain.OutboxEvent) error {
	m.savedEvents = append(m.savedEvents, event)
	return nil
}

func (m *mockOutboxRepo) GetPendingEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error) {
	return m.pendingEvents, nil
}

func (m *mockOutboxRepo) MarkAsPublished(ctx context.Context, id int64) error {
	m.publishedIDs = append(m.publishedIDs, id)
	return nil
}

func (m *mockOutboxRepo) IncrementRetry(ctx context.Context, id int64) error {
	m.incrementedIDs = append(m.incrementedIDs, id)
	return nil
}

type mockEventBus struct {
	publishedEvents []eventbus.Event
}

func (m *mockEventBus) Publish(ctx context.Context, event eventbus.Event) error {
	m.publishedEvents = append(m.publishedEvents, event)
	return nil
}

func (m *mockEventBus) Subscribe(eventType string, handler eventbus.EventHandler) error {
	return nil
}

func (m *mockEventBus) Start(ctx context.Context) error {
	return nil
}

func (m *mockEventBus) Close() error {
	return nil
}

type mockKeljaClient struct {
	summaries            []domain.KeljaFulfillmentSummary
	details              map[int]*domain.KeljaFulfillmentDetail
	fetchSummariesCalled bool
	fetchDetailCalledIDs []int
}

func (m *mockKeljaClient) FetchRecentFulfillments(ctx context.Context, page int, limit int) ([]domain.KeljaFulfillmentSummary, error) {
	m.fetchSummariesCalled = true
	return m.summaries, nil
}

func (m *mockKeljaClient) FetchFulfillmentDetail(ctx context.Context, id int) (*domain.KeljaFulfillmentDetail, error) {
	m.fetchDetailCalledIDs = append(m.fetchDetailCalledIDs, id)
	if m.details != nil {
		if detail, ok := m.details[id]; ok {
			return detail, nil
		}
	}
	return nil, nil
}

type mockProductRepo struct {
	catalog_port.ProductRepository
	skuMap map[string]int
}

func (m *mockProductRepo) GetProductIDBySKUTx(ctx context.Context, sku string) (int, error) {
	if m.skuMap != nil {
		if id, ok := m.skuMap[sku]; ok {
			return id, nil
		}
	}
	return 0, nil
}

func TestStockTransactionService_CreateTransaction_GreedyMultiLocationSplit(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("Success Greedy Split across multiple locations in DISPLAY", func(t *testing.T) {
		trxRepo := &mockTrxRepo{}
		locRepo := &mockLocRepo{
			availLocs: []domain.AvailableLocationStock{
				{LocationID: 101, AvailableQuantity: 6},
				{LocationID: 102, AvailableQuantity: 5},
			},
		}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, nil, nil, nil)

		req := inventory_dto.CreateTransactionRequest{
			ReferenceType:    "ORDER",
			ReferenceID:      "ORD-001",
			AssignedBuilding: "BLD-A",
			Items: []inventory_dto.TransactionItemRequest{
				{ProductID: 1, TargetQuantity: 10},
			},
		}

		trx, err := svc.CreateTransaction(context.Background(), req)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if trx == nil {
			t.Fatal("expected trx to be created")
		}

		// Verify fulfillment source query was executed
		if !locRepo.fulfillmentStockCalled {
			t.Errorf("expected FindFulfillmentSourceStock to be called")
		}

		// Verify greedy reservation: 6 from Loc 101, 4 from Loc 102
		if len(locRepo.reservedCalls) != 2 {
			t.Fatalf("expected 2 reserve calls, got %d", len(locRepo.reservedCalls))
		}

		if locRepo.reservedCalls[0].locationID != 101 || locRepo.reservedCalls[0].qty != 6 {
			t.Errorf("expected call 0 to be loc 101 qty 6, got %+v", locRepo.reservedCalls[0])
		}

		if locRepo.reservedCalls[1].locationID != 102 || locRepo.reservedCalls[1].qty != 4 {
			t.Errorf("expected call 1 to be loc 102 qty 4, got %+v", locRepo.reservedCalls[1])
		}
	})

	t.Run("Hold order when DISPLAY is insufficient but STORAGE has sufficient stock", func(t *testing.T) {
		trxRepo := &mockTrxRepo{}
		locRepo := &mockLocRepo{
			availLocsFn: func(productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
				if purpose == "DISPLAY" {
					return []domain.AvailableLocationStock{
						{LocationID: 101, AvailableQuantity: 3},
						{LocationID: 102, AvailableQuantity: 2},
					}, nil // Total display = 5
				}
				if purpose == "STORAGE" {
					return []domain.AvailableLocationStock{
						{LocationID: 201, AvailableQuantity: 10},
					}, nil // Storage has 10
				}
				return nil, nil
			},
			findByIDLoc: &domain.Location{ImmutableEntity: kernel.ImmutableEntity{ID: 201}, Code: "R-STR-01", Building: "BLD-A", Purpose: "STORAGE"},
		}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, nil, nil, nil)

		req := inventory_dto.CreateTransactionRequest{
			ReferenceType:    "ORDER",
			ReferenceID:      "ORD-002",
			AssignedBuilding: "BLD-A",
			Items: []inventory_dto.TransactionItemRequest{
				{ProductID: 1, TargetQuantity: 10}, // Needs 10: 5 from DISPLAY, 5 deficit covered by STORAGE
			},
		}

		trx, err := svc.CreateTransaction(context.Background(), req)
		if err != nil {
			t.Fatalf("expected order to be created on hold, got error: %v", err)
		}

		if trx.Status != domain.TransactionStatusHoldReplenishment {
			t.Errorf("expected status %s, got %s", domain.TransactionStatusHoldReplenishment, trx.Status)
		}

		// Zero Partial Reservation: must NOT reserve any stock
		if len(locRepo.reservedCalls) != 0 {
			t.Errorf("expected 0 reserved calls on hold, got %d", len(locRepo.reservedCalls))
		}

		if trx.Notes == nil || !strings.Contains(*trx.Notes, "deficit_quantity") {
			t.Errorf("expected notes to contain deficit details, got %v", trx.Notes)
		}
	})

	t.Run("Hold order with OUT_OF_STOCK when total warehouse stock is insufficient", func(t *testing.T) {
		trxRepo := &mockTrxRepo{}
		locRepo := &mockLocRepo{
			availLocsFn: func(productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
				if purpose == "DISPLAY" {
					return []domain.AvailableLocationStock{
						{LocationID: 101, AvailableQuantity: 2},
					}, nil
				}
				if purpose == "STORAGE" {
					return []domain.AvailableLocationStock{
						{LocationID: 201, AvailableQuantity: 3},
					}, nil
				}
				return nil, nil // Total across all = 5 < 10
			},
		}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, nil, nil, nil)

		req := inventory_dto.CreateTransactionRequest{
			ReferenceType:    "ORDER",
			ReferenceID:      "ORD-003",
			AssignedBuilding: "BLD-A",
			Items: []inventory_dto.TransactionItemRequest{
				{ProductID: 1, TargetQuantity: 10},
			},
		}

		trx, err := svc.CreateTransaction(context.Background(), req)
		if err != nil {
			t.Fatalf("expected order to be created, got error: %v", err)
		}

		if trx.Status != domain.TransactionStatusOutOfStock {
			t.Errorf("expected status %s, got %s", domain.TransactionStatusOutOfStock, trx.Status)
		}

		if len(locRepo.reservedCalls) != 0 {
			t.Errorf("expected 0 reserved calls, got %d", len(locRepo.reservedCalls))
		}
	})
}

func TestStockTransactionService_TransactionalOutbox(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("ExecuteTransaction writes OutboxEvent when completed", func(t *testing.T) {
		existingTrx := &domain.StockTransaction{
			ID:               1,
			TransactionNo:    "TRX-12345",
			ReferenceType:    "ORDER",
			ReferenceID:      "REF-001",
			AssignedBuilding: "BLD-A",
			Status:           "PENDING",
			Movements: []*domain.TransactionMovement{
				{
					ID:             10,
					TransactionID:  1,
					ProductID:      5,
					TargetQuantity: 3,
					Status:         "PENDING",
				},
			},
		}

		trxRepo := &mockTrxRepo{getByIDTrx: existingTrx}
		locRepo := &mockLocRepo{
			findByIDLoc: &domain.Location{
				ImmutableEntity:     kernel.ImmutableEntity{ID: 50},
				Building:            "BLD-A",
				Purpose:             "DISPLAY",
				IsFulfillmentSource: true,
			},
		}
		outboxRepo := &mockOutboxRepo{}
		eb := &mockEventBus{}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, outboxRepo, nil, nil, eb)

		req := inventory_dto.ExecuteTransactionRequest{
			TransactionID: 1,
			MovementID:    10,
			LocationID:    50,
			QtyDone:       3,
		}

		err := svc.ExecuteTransaction(context.Background(), req, 99)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		// Verify transaction marked as COMPLETED
		if existingTrx.Status != "COMPLETED" {
			t.Errorf("expected trx status COMPLETED, got %s", existingTrx.Status)
		}

		// Verify Outbox Event was written instead of direct publish to event bus
		if len(eb.publishedEvents) != 0 {
			t.Errorf("expected 0 direct publish calls, got %d", len(eb.publishedEvents))
		}

		if len(outboxRepo.savedEvents) != 1 {
			t.Fatalf("expected 1 outbox event saved, got %d", len(outboxRepo.savedEvents))
		}

		saved := outboxRepo.savedEvents[0]
		if saved.EventType != "InventoryFulfilled" {
			t.Errorf("expected event_type InventoryFulfilled, got %s", saved.EventType)
		}
		if saved.AggregateID != "TRX-12345" {
			t.Errorf("expected aggregate_id TRX-12345, got %s", saved.AggregateID)
		}
		if saved.Status != "PENDING" {
			t.Errorf("expected status PENDING, got %s", saved.Status)
		}
	})

	t.Run("DispatchPendingOutboxEvents publishes to broker and marks published", func(t *testing.T) {
		outboxRepo := &mockOutboxRepo{
			pendingEvents: []domain.OutboxEvent{
				{
					ID:            1,
					AggregateType: "StockTransaction",
					AggregateID:   "TRX-001",
					EventType:     "InventoryFulfilled",
					Payload:       `{"transaction_no":"TRX-001"}`,
					Status:        "PENDING",
					CreatedAt:     time.Now(),
				},
				{
					ID:            2,
					AggregateType: "StockTransaction",
					AggregateID:   "TRX-002",
					EventType:     "InventoryFulfilled",
					Payload:       `{"transaction_no":"TRX-002"}`,
					Status:        "PENDING",
					CreatedAt:     time.Now(),
				},
			},
		}
		eb := &mockEventBus{}

		svc := usecase.NewStockTransactionService(txManager, &mockTrxRepo{}, &mockLocRepo{}, outboxRepo, nil, nil, eb)

		count, err := svc.DispatchPendingOutboxEvents(context.Background())
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if count != 2 {
			t.Errorf("expected 2 dispatched events, got %d", count)
		}

		if len(eb.publishedEvents) != 2 {
			t.Errorf("expected 2 events published to EventBus, got %d", len(eb.publishedEvents))
		}

		if len(outboxRepo.publishedIDs) != 2 {
			t.Errorf("expected 2 outbox IDs marked as published, got %d", len(outboxRepo.publishedIDs))
		}
	})
}

func TestStockTransactionService_ReconcileMissingFulfillments(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("Successfully reconciles missing Kelja fulfillment order", func(t *testing.T) {
		trxRepo := &mockTrxRepo{getByRefTrx: nil}
		locRepo := &mockLocRepo{
			availLocs: []domain.AvailableLocationStock{
				{LocationID: 101, AvailableQuantity: 10},
			},
		}
		keljaClient := &mockKeljaClient{
			summaries: []domain.KeljaFulfillmentSummary{
				{ID: 501, Code: "KLJ-ORD-001", Status: "PENDING"},
			},
			details: map[int]*domain.KeljaFulfillmentDetail{
				501: {
					ID:   501,
					Code: "KLJ-ORD-001",
					Items: []domain.KeljaFulfillmentItem{
						{ProductCode: "SKU-ABC", Quantity: 5},
					},
				},
			},
		}
		productRepo := &mockProductRepo{
			skuMap: map[string]int{
				"SKU-ABC": 42,
			},
		}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, keljaClient, productRepo, nil)

		reconciled, err := svc.ReconcileMissingFulfillments(context.Background())
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if reconciled != 1 {
			t.Errorf("expected 1 reconciled order, got %d", reconciled)
		}

		if trxRepo.createdTrx == nil {
			t.Fatal("expected transaction to be created in WMS")
		}

		if trxRepo.createdTrx.ReferenceType != "KELJA_FULFILLMENT" || trxRepo.createdTrx.ReferenceID != "KLJ-ORD-001" {
			t.Errorf("unexpected trx reference: type=%s, id=%s", trxRepo.createdTrx.ReferenceType, trxRepo.createdTrx.ReferenceID)
		}

		if len(locRepo.reservedCalls) != 1 || locRepo.reservedCalls[0].qty != 5 {
			t.Errorf("expected 1 reservation call with qty 5, got %+v", locRepo.reservedCalls)
		}
	})

	t.Run("Skips orders already existing in WMS by reference", func(t *testing.T) {
		existingTrx := &domain.StockTransaction{
			ID:            10,
			ReferenceType: "KELJA_FULFILLMENT",
			ReferenceID:   "KLJ-ORD-002",
		}
		trxRepo := &mockTrxRepo{getByRefTrx: existingTrx}
		locRepo := &mockLocRepo{}
		keljaClient := &mockKeljaClient{
			summaries: []domain.KeljaFulfillmentSummary{
				{ID: 502, Code: "KLJ-ORD-002", Status: "PENDING"},
			},
		}
		productRepo := &mockProductRepo{}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, keljaClient, productRepo, nil)

		reconciled, err := svc.ReconcileMissingFulfillments(context.Background())
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if reconciled != 0 {
			t.Errorf("expected 0 reconciled orders, got %d", reconciled)
		}

		if len(keljaClient.fetchDetailCalledIDs) != 0 {
			t.Errorf("expected 0 fetch detail calls, got %d", len(keljaClient.fetchDetailCalledIDs))
		}
	})

	t.Run("Skips orders with terminal status (CANCELLED, FINISHED, VOID)", func(t *testing.T) {
		trxRepo := &mockTrxRepo{getByRefTrx: nil}
		locRepo := &mockLocRepo{}
		keljaClient := &mockKeljaClient{
			summaries: []domain.KeljaFulfillmentSummary{
				{ID: 503, Code: "KLJ-ORD-003", Status: "CANCELLED"},
				{ID: 504, Code: "KLJ-ORD-004", Status: "FINISHED"},
			},
		}
		productRepo := &mockProductRepo{}

		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, keljaClient, productRepo, nil)

		reconciled, err := svc.ReconcileMissingFulfillments(context.Background())
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if reconciled != 0 {
			t.Errorf("expected 0 reconciled orders, got %d", reconciled)
		}
	})
}

func TestStockTransactionService_BatchExecuteTransactions(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("Batch executes multiple picking items with mixed results", func(t *testing.T) {
		existingTrx := &domain.StockTransaction{
			ID:               1,
			TransactionNo:    "TRX-BATCH-1",
			ReferenceType:    "ORDER",
			ReferenceID:      "REF-001",
			AssignedBuilding: "BLD-A",
			Status:           "PENDING",
			Movements: []*domain.TransactionMovement{
				{
					ID:             10,
					TransactionID:  1,
					ProductID:      5,
					TargetQuantity: 3,
					Status:         "PENDING",
				},
			},
		}

		trxRepo := &mockTrxRepo{getByIDTrx: existingTrx}
		locRepo := &mockLocRepo{
			findByIDLoc: &domain.Location{
				ImmutableEntity:     kernel.ImmutableEntity{ID: 50},
				Building:            "BLD-A",
				Purpose:             "DISPLAY",
				IsFulfillmentSource: true,
			},
		}
		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, nil, nil, nil)

		req := inventory_dto.BatchExecuteTransactionRequest{
			Items: []inventory_dto.ExecuteTransactionRequest{
				{
					TransactionID: 1,
					MovementID:    10,
					LocationID:    50,
					QtyDone:       3,
				},
				{
					TransactionID: 1,
					MovementID:    999, // Non-existent movement ID -> fails
					LocationID:    50,
					QtyDone:       1,
				},
			},
		}

		res, err := svc.BatchExecuteTransactions(context.Background(), req, 1)
		if err != nil {
			t.Fatalf("expected no error from batch runner, got %v", err)
		}

		if res.TotalProcessed != 2 {
			t.Errorf("expected 2 processed, got %d", res.TotalProcessed)
		}
		if res.SuccessCount != 1 {
			t.Errorf("expected 1 success, got %d", res.SuccessCount)
		}
		if res.FailureCount != 1 {
			t.Errorf("expected 1 failure, got %d", res.FailureCount)
		}
		if len(res.Errors) != 1 {
			t.Errorf("expected 1 error detail, got %d", len(res.Errors))
		}
	})
}

func TestStockTransactionService_GetOnHoldFulfillments(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("Successfully returns on-hold orders with parsed deficits", func(t *testing.T) {
		notes := `[{"product_id":1,"sku":"SKU-001","product_name":"Test Product","target_quantity":10,"display_available_quantity":4,"deficit_quantity":6,"suggested_sources":[{"location_id":201,"location_code":"R-STR-01","building":"BLD-A","purpose":"STORAGE","available_quantity":15}]}]`
		heldTrxList := []domain.StockTransaction{
			{
				ID:               101,
				TransactionNo:    "TRX-HOLD-001",
				ReferenceType:    "ORDER",
				ReferenceID:      "ORD-HOLD-1",
				AssignedBuilding: "BLD-A",
				Status:           domain.TransactionStatusHoldReplenishment,
				Notes:            &notes,
				CreatedAt:        time.Now(),
			},
			{
				ID:               102,
				TransactionNo:    "TRX-OOS-002",
				ReferenceType:    "ORDER",
				ReferenceID:      "ORD-OOS-2",
				AssignedBuilding: "BLD-B",
				Status:           domain.TransactionStatusOutOfStock,
				CreatedAt:        time.Now(),
			},
		}

		trxRepo := &mockTrxRepo{getHeldTrx: heldTrxList}
		svc := usecase.NewStockTransactionService(txManager, trxRepo, nil, nil, nil, nil, nil)

		summaries, err := svc.GetOnHoldFulfillments(context.Background(), "")
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if len(summaries) != 2 {
			t.Fatalf("expected 2 summaries, got %d", len(summaries))
		}

		first := summaries[0]
		if first.TransactionID != 101 || first.Status != domain.TransactionStatusHoldReplenishment {
			t.Errorf("unexpected first summary: %+v", first)
		}
		if len(first.Deficits) != 1 {
			t.Fatalf("expected 1 deficit parsed, got %d", len(first.Deficits))
		}
		if first.Deficits[0].DeficitQuantity != 6 || first.Deficits[0].SKU != "SKU-001" {
			t.Errorf("unexpected deficit contents: %+v", first.Deficits[0])
		}

		// Building filter
		filtered, err := svc.GetOnHoldFulfillments(context.Background(), "BLD-A")
		if err != nil {
			t.Fatalf("expected no error with filter, got %v", err)
		}
		if len(filtered) != 1 {
			t.Errorf("expected 1 filtered summary for BLD-A, got %d", len(filtered))
		}
	})
}

func TestStockTransactionService_ReleaseHeldFulfillment(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("Fail when transaction is not held", func(t *testing.T) {
		completedTrx := &domain.StockTransaction{
			ID:               201,
			TransactionNo:    "TRX-DONE-201",
			AssignedBuilding: "BLD-A",
			Status:           domain.TransactionStatusCompleted,
		}
		trxRepo := &mockTrxRepo{getByIDTrx: completedTrx}
		svc := usecase.NewStockTransactionService(txManager, trxRepo, nil, nil, nil, nil, nil)

		_, err := svc.ReleaseHeldFulfillment(context.Background(), 201)
		if err != domain.ErrCannotReleaseNotHeld {
			t.Errorf("expected ErrCannotReleaseNotHeld, got %v", err)
		}
	})

	t.Run("Fail when DISPLAY stock is still insufficient", func(t *testing.T) {
		heldTrx := &domain.StockTransaction{
			ID:               202,
			TransactionNo:    "TRX-HOLD-202",
			AssignedBuilding: "BLD-A",
			Status:           domain.TransactionStatusHoldReplenishment,
			Movements: []*domain.TransactionMovement{
				{
					ID:             1,
					ProductID:      10,
					TargetQuantity: 8,
				},
			},
		}
		trxRepo := &mockTrxRepo{getByIDTrx: heldTrx}
		locRepo := &mockLocRepo{
			availLocs: []domain.AvailableLocationStock{
				{LocationID: 101, AvailableQuantity: 3}, // Only 3 in DISPLAY, needs 8
			},
		}
		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, nil, nil, nil)

		_, err := svc.ReleaseHeldFulfillment(context.Background(), 202)
		if err == nil {
			t.Fatal("expected error due to insufficient display stock, got nil")
		}
		if !strings.Contains(err.Error(), "insufficient display stock") {
			t.Errorf("unexpected error message: %v", err)
		}
	})

	t.Run("Success release after manual replenishment to DISPLAY", func(t *testing.T) {
		heldTrx := &domain.StockTransaction{
			ID:               203,
			TransactionNo:    "TRX-HOLD-203",
			AssignedBuilding: "BLD-A",
			Status:           domain.TransactionStatusHoldReplenishment,
			Movements: []*domain.TransactionMovement{
				{
					ID:             1,
					ProductID:      10,
					TargetQuantity: 8,
				},
			},
		}
		trxRepo := &mockTrxRepo{getByIDTrx: heldTrx}
		locRepo := &mockLocRepo{
			availLocs: []domain.AvailableLocationStock{
				{LocationID: 101, AvailableQuantity: 5},
				{LocationID: 102, AvailableQuantity: 5}, // Total 10 in DISPLAY, enough for 8
			},
		}
		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, nil, nil, nil, nil)

		released, err := svc.ReleaseHeldFulfillment(context.Background(), 203)
		if err != nil {
			t.Fatalf("expected successful release, got error: %v", err)
		}

		if released.Status != domain.TransactionStatusReadyToPick {
			t.Errorf("expected status %s, got %s", domain.TransactionStatusReadyToPick, released.Status)
		}

		if !trxRepo.updateTrxCalled {
			t.Error("expected UpdateTransactionTx to be called")
		}

		// Verify stock was reserved: 5 from 101, 3 from 102
		if len(locRepo.reservedCalls) != 2 {
			t.Fatalf("expected 2 reserve calls, got %d", len(locRepo.reservedCalls))
		}
		if locRepo.reservedCalls[0].qty != 5 || locRepo.reservedCalls[1].qty != 3 {
			t.Errorf("unexpected reserved quantities: %+v", locRepo.reservedCalls)
		}
	})
}

func TestStockTransactionService_EndToEnd_ManualReplenishmentFlow(t *testing.T) {
	txManager := &mockTxManager{}

	t.Run("Full End-to-End simulation of manual replenishment from hold to completed picking", func(t *testing.T) {
		// 1. Initial State:
		// Product 10: DISPLAY has 3 pcs, STORAGE has 12 pcs.
		displayStock := 3
		storageStock := 12

		var activeTrx *domain.StockTransaction
		trxRepo := &mockTrxRepo{}
		// Override createTxFn to capture trx
		trxRepo.createTxFn = func(ctx context.Context, trx *domain.StockTransaction) error {
			trx.ID = 555
			// Assign movement ID if not assigned
			for i, m := range trx.Movements {
				m.ID = uint(1000 + i)
			}
			activeTrx = trx
			trxRepo.getByIDTrx = trx
			return nil
		}

		locRepo := &mockLocRepo{
			findByIDLoc: &domain.Location{
				ImmutableEntity:     kernel.ImmutableEntity{ID: 101},
				Code:                "R-DSP-01",
				Building:            "BLD-A",
				Purpose:             "DISPLAY",
				IsFulfillmentSource: true,
			},
			availLocsFn: func(productID int, purpose string, building string) ([]domain.AvailableLocationStock, error) {
				if purpose == "DISPLAY" {
					return []domain.AvailableLocationStock{
						{LocationID: 101, AvailableQuantity: displayStock},
					}, nil
				}
				if purpose == "STORAGE" {
					return []domain.AvailableLocationStock{
						{LocationID: 201, AvailableQuantity: storageStock},
					}, nil
				}
				return nil, nil
			},
		}

		outboxRepo := &mockOutboxRepo{}
		svc := usecase.NewStockTransactionService(txManager, trxRepo, locRepo, outboxRepo, nil, nil, nil)

		// 2. Incoming order arrives needing 8 pcs
		orderReq := inventory_dto.CreateTransactionRequest{
			ReferenceType:    "KELJA_FULFILLMENT",
			ReferenceID:      "KLJ-E2E-999",
			AssignedBuilding: "BLD-A",
			Items: []inventory_dto.TransactionItemRequest{
				{ProductID: 10, TargetQuantity: 8},
			},
		}

		createdTrx, err := svc.CreateTransaction(context.Background(), orderReq)
		if err != nil {
			t.Fatalf("expected order creation to succeed on hold, got %v", err)
		}

		// Verify held state
		if createdTrx.Status != domain.TransactionStatusHoldReplenishment {
			t.Fatalf("expected status %s, got %s", domain.TransactionStatusHoldReplenishment, createdTrx.Status)
		}
		if len(locRepo.reservedCalls) != 0 {
			t.Fatalf("expected 0 reserved calls initially, got %d", len(locRepo.reservedCalls))
		}
		if createdTrx.Notes == nil || !strings.Contains(*createdTrx.Notes, "deficit_quantity") {
			t.Fatalf("expected deficit notes, got %v", createdTrx.Notes)
		}

		// 3. Premature release attempt (before replenishment) -> MUST FAIL
		_, err = svc.ReleaseHeldFulfillment(context.Background(), createdTrx.ID)
		if err == nil {
			t.Fatal("expected premature release to fail, got nil")
		}
		if !strings.Contains(err.Error(), "insufficient display stock") {
			t.Errorf("unexpected error message: %v", err)
		}

		// 4. Warehouse operator executes physical stock movement:
		// Transfers 7 pcs from STORAGE to DISPLAY.
		// DISPLAY now has 3 + 7 = 10 pcs; STORAGE has 12 - 7 = 5 pcs.
		displayStock += 7
		storageStock -= 7

		// 5. Operator clicks "Verifikasi & Release Order" -> MUST SUCCEED
		releasedTrx, err := svc.ReleaseHeldFulfillment(context.Background(), createdTrx.ID)
		if err != nil {
			t.Fatalf("expected release to succeed after replenishment, got %v", err)
		}

		if releasedTrx.Status != domain.TransactionStatusReadyToPick {
			t.Errorf("expected status %s, got %s", domain.TransactionStatusReadyToPick, releasedTrx.Status)
		}

		// Verify greedy reservation: 8 pcs reserved on Loc 101
		if len(locRepo.reservedCalls) != 1 || locRepo.reservedCalls[0].qty != 8 {
			t.Fatalf("expected 8 pcs reserved on Loc 101, got %+v", locRepo.reservedCalls)
		}

		// 6. Picking Execution: Operator picks 8 pcs from DISPLAY Rack 101
		pickReq := inventory_dto.ExecuteTransactionRequest{
			TransactionID: releasedTrx.ID,
			MovementID:    releasedTrx.Movements[0].ID,
			LocationID:    101,
			QtyDone:       8,
		}

		err = svc.ExecuteTransaction(context.Background(), pickReq, 1)
		if err != nil {
			t.Fatalf("expected picking execution to succeed, got %v", err)
		}

		// Verify stock released from reservation & deducted physically
		if len(locRepo.releasedCalls) != 1 || locRepo.releasedCalls[0].qty != 8 {
			t.Errorf("expected 8 pcs released from reserve, got %+v", locRepo.releasedCalls)
		}
		if len(locRepo.deductedCalls) != 1 || locRepo.deductedCalls[0].qty != 8 {
			t.Errorf("expected 8 pcs deducted physically, got %+v", locRepo.deductedCalls)
		}

		// Verify final transaction state is COMPLETED
		if activeTrx.Status != "COMPLETED" {
			t.Errorf("expected transaction status COMPLETED, got %s", activeTrx.Status)
		}

		// Verify Outbox Event created
		if len(outboxRepo.savedEvents) != 1 {
			t.Errorf("expected 1 outbox event saved, got %d", len(outboxRepo.savedEvents))
		}
		if outboxRepo.savedEvents[0].EventType != "InventoryFulfilled" {
			t.Errorf("expected event type InventoryFulfilled, got %s", outboxRepo.savedEvents[0].EventType)
		}
	})
}


