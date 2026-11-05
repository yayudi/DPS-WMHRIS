package rabbitmq

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"testing"

	"github.com/go-sql-driver/mysql"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type mockDBExecutor struct {
	execContextFunc func(ctx context.Context, query string, args ...any) (sql.Result, error)
	getContextFunc  func(ctx context.Context, dest interface{}, query string, args ...interface{}) error
}

func (m *mockDBExecutor) ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error) {
	if m.execContextFunc != nil {
		return m.execContextFunc(ctx, query, args...)
	}
	return nil, nil
}

func (m *mockDBExecutor) GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error {
	if m.getContextFunc != nil {
		return m.getContextFunc(ctx, dest, query, args...)
	}
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
}
