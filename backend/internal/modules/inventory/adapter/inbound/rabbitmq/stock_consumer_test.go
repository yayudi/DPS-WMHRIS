package rabbitmq

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/go-sql-driver/mysql"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type mockDBExecutor struct {
	execContextFunc func(ctx context.Context, query string, args ...any) (sql.Result, error)
	getContextFunc  func(ctx context.Context, dest any, query string, args ...any) error
}

func (m *mockDBExecutor) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execContextFunc != nil {
		return m.execContextFunc(ctx, query, args...)
	}
	return nil, nil
}

func (m *mockDBExecutor) GetContext(ctx context.Context, dest any, query string, args ...any) error {
	if m.getContextFunc != nil {
		return m.getContextFunc(ctx, dest, query, args...)
	}
	return nil
}

type mockConsumerTxManager struct {
	txCalls   int
	committed int
	rolled    int
}

func (m *mockConsumerTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	m.txCalls++
	if err := fn(ctx); err != nil {
		m.rolled++
		return err
	}
	m.committed++
	return nil
}

type mockStockMover struct {
	moveStockFunc func(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error
}

func (m *mockStockMover) MoveStock(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error {
	if m.moveStockFunc != nil {
		return m.moveStockFunc(ctx, userID, req)
	}
	return nil
}

func TestCheckAndMarkIdempotency(t *testing.T) {
	ctx := context.Background()

	t.Run("Empty event ID skips check", func(t *testing.T) {
		consumer := &StockConsumer{}
		processed, err := consumer.checkAndMarkIdempotency(ctx, "", "test.topic")
		if err != nil || processed {
			t.Errorf("expected false, nil; got %v, %v", processed, err)
		}
	})

	t.Run("Duplicate entry 1062 returns already processed (true, nil)", func(t *testing.T) {
		mockDB := &mockDBExecutor{
			execContextFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, &mysql.MySQLError{Number: 1062, Message: "Duplicate entry"}
			},
		}
		consumer := &StockConsumer{db: mockDB}

		processed, err := consumer.checkAndMarkIdempotency(ctx, "evt-123", "inventory.stock.decreased")
		if err != nil {
			t.Fatalf("expected nil error on duplicate, got: %v", err)
		}
		if !processed {
			t.Errorf("expected processed=true on duplicate 1062, got false")
		}
	})

	t.Run("Non-1062 DB error returns (false, error)", func(t *testing.T) {
		mockDB := &mockDBExecutor{
			execContextFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, errors.New("connection timeout")
			},
		}
		consumer := &StockConsumer{db: mockDB}

		processed, err := consumer.checkAndMarkIdempotency(ctx, "evt-456", "inventory.stock.decreased")
		if err == nil {
			t.Fatalf("expected error on DB failure, got nil")
		}
		if processed {
			t.Errorf("expected processed=false on DB failure, got true")
		}
	})

	t.Run("Successful insert returns (false, nil)", func(t *testing.T) {
		mockDB := &mockDBExecutor{
			execContextFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, nil
			},
		}
		consumer := &StockConsumer{db: mockDB}

		processed, err := consumer.checkAndMarkIdempotency(ctx, "evt-789", "inventory.stock.decreased")
		if err != nil || processed {
			t.Errorf("expected false, nil; got %v, %v", processed, err)
		}
	})
}

func TestHandleStockDecreased_IdempotencyFlow(t *testing.T) {
	ctx := context.Background()

	t.Run("Duplicate event is acknowledged without running MoveStock", func(t *testing.T) {
		moveCalled := false
		mockStock := &mockStockMover{
			moveStockFunc: func(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error {
				moveCalled = true
				return nil
			},
		}
		mockDB := &mockDBExecutor{
			execContextFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, &mysql.MySQLError{Number: 1062}
			},
		}

		consumer := &StockConsumer{stockService: mockStock, db: mockDB}

		payload, _ := json.Marshal(stockDecreasedData{
			EventID:   "evt-dup",
			ProductID: 5,
			Quantity:  2,
		})
		evt := eventbus.Event{
			Type:    "inventory.stock.decreased",
			Payload: payload,
		}

		err := consumer.handleStockDecreased(ctx, evt)
		if err != nil {
			t.Fatalf("expected nil error on duplicate (ACK), got %v", err)
		}
		if moveCalled {
			t.Errorf("MoveStock should not be called for duplicate event")
		}
	})

	t.Run("DB error triggers return of error (NACK/requeue)", func(t *testing.T) {
		moveCalled := false
		mockStock := &mockStockMover{
			moveStockFunc: func(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error {
				moveCalled = true
				return nil
			},
		}
		mockDB := &mockDBExecutor{
			execContextFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, errors.New("deadlock found")
			},
		}

		consumer := &StockConsumer{stockService: mockStock, db: mockDB}

		payload, _ := json.Marshal(stockDecreasedData{
			EventID:   "evt-db-fail",
			ProductID: 5,
			Quantity:  2,
		})
		evt := eventbus.Event{
			Type:    "inventory.stock.decreased",
			Payload: payload,
		}

		err := consumer.handleStockDecreased(ctx, evt)
		if err == nil {
			t.Fatalf("expected error on DB failure, got nil")
		}
		if moveCalled {
			t.Errorf("MoveStock should not be called when idempotency check fails")
		}
	})

	t.Run("Valid non-duplicate event calls MoveStock", func(t *testing.T) {
		var receivedReq inventory_dto.MoveStockRequest
		mockStock := &mockStockMover{
			moveStockFunc: func(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error {
				receivedReq = req
				return nil
			},
		}
		mockDB := &mockDBExecutor{
			execContextFunc: func(ctx context.Context, query string, args ...any) (sql.Result, error) {
				return nil, nil // First time seen
			},
		}

		consumer := &StockConsumer{stockService: mockStock, db: mockDB}

		payload, _ := json.Marshal(stockDecreasedData{
			EventID:      "evt-valid",
			ProductID:    10,
			Quantity:     3,
			MovementType: "SALE",
			Notes:        "Order #123",
		})
		evt := eventbus.Event{
			Type:    "inventory.stock.decreased",
			Payload: payload,
		}

		err := consumer.handleStockDecreased(ctx, evt)
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if receivedReq.ProductID != 10 || receivedReq.Quantity != 3 || receivedReq.MovementType != "SALE" {
			t.Errorf("unexpected MoveStockRequest received: %+v", receivedReq)
		}
	})

	t.Run("MoveStock failure rolls back outer atomic transaction (no idempotency poisoning)", func(t *testing.T) {
		txMgr := &mockConsumerTxManager{}
		mockDB := &mockDBExecutor{
			execContextFunc: func(_ context.Context, _ string, _ ...any) (sql.Result, error) {
				return nil, nil
			},
		}
		mockStock := &mockStockMover{
			moveStockFunc: func(_ context.Context, _ int, _ inventory_dto.MoveStockRequest) error {
				return errors.New("deadlock retryable")
			},
		}
		consumer := &StockConsumer{txManager: txMgr, stockService: mockStock, db: mockDB}
		payload, _ := json.Marshal(stockDecreasedData{EventID: "evt-tx-rollback", ProductID: 5, Quantity: 2})

		err := consumer.handleStockDecreased(ctx, eventbus.Event{Type: "inventory.stock.decreased", Payload: payload})
		if err == nil || txMgr.txCalls != 1 || txMgr.rolled != 1 || txMgr.committed != 0 {
			t.Fatalf("expected rollback on MoveStock failure, got err=%v tx=%+v", err, txMgr)
		}
	})

	t.Run("Invalid negative or zero payload returns early before touching processed_events", func(t *testing.T) {
		dbTouched := false
		mockDB := &mockDBExecutor{
			execContextFunc: func(_ context.Context, _ string, _ ...any) (sql.Result, error) {
				dbTouched = true
				return nil, nil
			},
		}
		consumer := &StockConsumer{stockService: &mockStockMover{}, db: mockDB}
		payload, _ := json.Marshal(stockDecreasedData{EventID: "evt-bad", ProductID: 5, Quantity: -3})

		if err := consumer.handleStockDecreased(ctx, eventbus.Event{Type: "inventory.stock.decreased", Payload: payload}); err != nil {
			t.Fatalf("expected nil on skipped invalid payload, got %v", err)
		}
		if dbTouched {
			t.Fatalf("processed_events must not be inserted for invalid payload")
		}
	})
}

func TestHandleStockReturned_ActiveQAAndDBErrorPropagation(t *testing.T) {
	ctx := context.Background()

	t.Run("Queries active non-deleted QA location and falls back to ID 1 only on sql.ErrNoRows", func(t *testing.T) {
		var capturedQuery string
		var movedReq inventory_dto.MoveStockRequest
		mockDB := &mockDBExecutor{
			getContextFunc: func(_ context.Context, _ any, query string, _ ...any) error {
				capturedQuery = query
				return sql.ErrNoRows
			},
		}
		mockStock := &mockStockMover{
			moveStockFunc: func(_ context.Context, _ int, req inventory_dto.MoveStockRequest) error {
				movedReq = req
				return nil
			},
		}
		txMgr := &mockConsumerTxManager{}
		consumer := &StockConsumer{txManager: txMgr, stockService: mockStock, db: mockDB}
		payload, _ := json.Marshal(stockReturnedData{EventID: "ret-1", ProductID: 7, Quantity: 2, Notes: "Cancel"})

		if err := consumer.handleStockReturned(ctx, eventbus.Event{Type: "inventory.stock.returned", Payload: payload}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(capturedQuery, "is_active = 1") || !strings.Contains(capturedQuery, "deleted_at IS NULL") {
			t.Fatalf("QA query must filter active non-deleted locations: %s", capturedQuery)
		}
		if movedReq.ToLocationID == nil || *movedReq.ToLocationID != 1 {
			t.Fatalf("expected fallback ToLocationID=1 on ErrNoRows, got %+v", movedReq)
		}
	})

	t.Run("Real DB error during QA lookup returns error instead of falling back to location 1", func(t *testing.T) {
		moveCalled := false
		mockDB := &mockDBExecutor{
			getContextFunc: func(_ context.Context, _ any, _ string, _ ...any) error {
				return errors.New("mysql connection lost")
			},
		}
		mockStock := &mockStockMover{
			moveStockFunc: func(_ context.Context, _ int, _ inventory_dto.MoveStockRequest) error {
				moveCalled = true
				return nil
			},
		}
		txMgr := &mockConsumerTxManager{}
		consumer := &StockConsumer{txManager: txMgr, stockService: mockStock, db: mockDB}
		payload, _ := json.Marshal(stockReturnedData{EventID: "ret-db-err", ProductID: 7, Quantity: 2})

		if err := consumer.handleStockReturned(ctx, eventbus.Event{Type: "inventory.stock.returned", Payload: payload}); err == nil {
			t.Fatal("expected error on QA lookup DB failure")
		}
		if moveCalled || txMgr.rolled != 1 {
			t.Fatalf("expected rollback and 0 MoveStock calls on QA DB failure, moveCalled=%v rolled=%d", moveCalled, txMgr.rolled)
		}
	})
}
