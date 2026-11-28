// Package rabbitmq implements inbound RabbitMQ event consumers for inventory stock synchronization.
package rabbitmq

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"

	"github.com/jmoiron/sqlx"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type dbExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	GetContext(ctx context.Context, dest any, query string, args ...any) error
}

type stockMover interface {
	MoveStock(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error
}

// StockConsumer consumes inbound inventory RabbitMQ events with atomic processed_events idempotency.
type StockConsumer struct {
	txManager    database.TransactionManager
	stockService stockMover
	sqlxDB       *sqlx.DB
	db           dbExecutor
}

// NewStockConsumer creates a StockConsumer wired with TransactionManager so idempotency markers commit atomically with stock mutations.
func NewStockConsumer(txManager database.TransactionManager, stockService port.StockUseCase, db *sqlx.DB) *StockConsumer {
	return &StockConsumer{
		txManager:    txManager,
		stockService: stockService,
		sqlxDB:       db,
		db:           db,
	}
}

// RegisterHandlers subscribes StockConsumer handlers to inventory.stock.decreased and inventory.stock.returned topics.
func (c *StockConsumer) RegisterHandlers(bus eventbus.EventBus) error {
	if err := bus.Subscribe("inventory.stock.decreased", c.handleStockDecreased); err != nil {
		return err
	}
	return bus.Subscribe("inventory.stock.returned", c.handleStockReturned)
}

func (c *StockConsumer) executor(ctx context.Context) dbExecutor {
	if c.sqlxDB != nil {
		return database.GetExt(ctx, c.sqlxDB)
	}
	return c.db
}

func (c *StockConsumer) runInTx(ctx context.Context, fn func(txCtx context.Context) error) error {
	if c.txManager != nil {
		return c.txManager.WithTransaction(ctx, fn)
	}
	return fn(ctx)
}

func (c *StockConsumer) checkAndMarkIdempotency(ctx context.Context, eventID string, topic string) (bool, error) {
	if eventID == "" {
		return false, nil
	}

	query := "INSERT INTO processed_events (event_id, topic) VALUES (?, ?)"
	_, err := c.executor(ctx).ExecContext(ctx, query, eventID, topic)
	if err != nil {
		if database.IsDuplicateKey(err) {
			log.Printf("[StockConsumer] Event %s for topic %s already processed (duplicate 1062)", eventID, topic)
			return true, nil
		}
		return false, fmt.Errorf("failed to record processed event: %w", err)
	}
	return false, nil
}

type stockDecreasedData struct {
	EventID        string `json:"event_id"`
	ProductID      int    `json:"product_id"`
	Quantity       int    `json:"quantity"`
	MovementType   string `json:"movement_type"`
	FromLocationID *int   `json:"from_location_id"`
	ToLocationID   *int   `json:"to_location_id"`
	Notes          string `json:"notes"`
}

func (c *StockConsumer) handleStockDecreased(ctx context.Context, event eventbus.Event) error {
	var data stockDecreasedData
	if err := json.Unmarshal(event.Payload, &data); err != nil {
		return fmt.Errorf("failed to unmarshal stock.decreased payload: %w", err)
	}

	if data.ProductID <= 0 || data.Quantity <= 0 {
		return nil
	}
	if data.MovementType == "" {
		data.MovementType = "RABBITMQ_DECREASE"
	}

	req := inventory_dto.MoveStockRequest{
		ProductID:      data.ProductID,
		Quantity:       data.Quantity,
		MovementType:   data.MovementType,
		FromLocationID: data.FromLocationID,
		ToLocationID:   data.ToLocationID,
		Notes:          data.Notes,
	}

	const systemUserID = 1

	return c.runInTx(ctx, func(txCtx context.Context) error {
		isProcessed, err := c.checkAndMarkIdempotency(txCtx, data.EventID, "inventory.stock.decreased")
		if err != nil {
			return err
		}
		if isProcessed {
			log.Printf("[StockConsumer] Skipping duplicate event %s", data.EventID)
			return nil
		}

		if err := c.stockService.MoveStock(txCtx, systemUserID, req); err != nil {
			return err
		}

		log.Printf("[StockConsumer] Reduced stock for product ID %d by %d", data.ProductID, data.Quantity)
		return nil
	})
}

type stockReturnedData struct {
	EventID   string `json:"event_id"`
	ProductID int    `json:"product_id"`
	Quantity  int    `json:"quantity"`
	Notes     string `json:"notes"`
}

func (c *StockConsumer) handleStockReturned(ctx context.Context, event eventbus.Event) error {
	var data stockReturnedData
	if err := json.Unmarshal(event.Payload, &data); err != nil {
		return fmt.Errorf("failed to unmarshal stock.returned payload: %w", err)
	}

	if data.ProductID <= 0 || data.Quantity <= 0 {
		return nil
	}

	const systemUserID = 1

	return c.runInTx(ctx, func(txCtx context.Context) error {
		isProcessed, err := c.checkAndMarkIdempotency(txCtx, data.EventID, "inventory.stock.returned")
		if err != nil {
			return err
		}
		if isProcessed {
			log.Printf("[StockConsumer] Skipping duplicate return event %s", data.EventID)
			return nil
		}

		var qaLocationID int
		err = c.executor(txCtx).GetContext(
			txCtx,
			&qaLocationID,
			"SELECT id FROM locations WHERE purpose = 'QA' AND is_active = 1 AND deleted_at IS NULL LIMIT 1",
		)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				log.Printf("[StockConsumer] No active QA location found, falling back to location ID 1")
				qaLocationID = 1
			} else {
				return fmt.Errorf("failed to query QA location: %w", err)
			}
		}

		req := inventory_dto.MoveStockRequest{
			ProductID:    data.ProductID,
			Quantity:     data.Quantity,
			MovementType: "RETURN_INBOUND",
			ToLocationID: &qaLocationID,
			Notes:        fmt.Sprintf("Auto Return: %s", data.Notes),
		}

		if err := c.stockService.MoveStock(txCtx, systemUserID, req); err != nil {
			return err
		}

		log.Printf("[StockConsumer] Processed return for product ID %d by %d to location %d", data.ProductID, data.Quantity, qaLocationID)
		return nil
	})
}
