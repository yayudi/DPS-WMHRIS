package rabbitmq

import (
	"context"
	"database/sql"
	"encoding/json"
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
	GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
}

type stockMover interface {
	MoveStock(ctx context.Context, userID int, req inventory_dto.MoveStockRequest) error
}

type StockConsumer struct {
	stockService stockMover
	db           dbExecutor
}

func NewStockConsumer(stockService port.StockUseCase, db *sqlx.DB) *StockConsumer {
	return &StockConsumer{
		stockService: stockService,
		db:           db,
	}
}

func (c *StockConsumer) RegisterHandlers(bus eventbus.EventBus) error {
	if err := bus.Subscribe("inventory.stock.decreased", c.handleStockDecreased); err != nil {
		return err
	}
	return bus.Subscribe("inventory.stock.returned", c.handleStockReturned)
}

func (c *StockConsumer) checkAndMarkIdempotency(ctx context.Context, eventID string, topic string) (bool, error) {
	if eventID == "" {
		return false, nil // If no EventID provided, skip idempotency check (for backward compatibility)
	}

	query := "INSERT INTO processed_events (event_id, topic) VALUES (?, ?)"
	_, err := c.db.ExecContext(ctx, query, eventID, topic)
	if err != nil {
		if database.IsDuplicateKey(err) {
			log.Printf("[StockConsumer] Event %s for topic %s already processed (duplicate 1062)", eventID, topic)
			return true, nil // Already processed -> return true, nil to ACK without re-running
		}
		// Real DB error -> return error so RabbitMQ can retry/NACK
		return false, fmt.Errorf("failed to record processed event: %w", err)
	}
	return false, nil // Successfully marked as not processed
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

	// Idempotency Check
	isProcessed, err := c.checkAndMarkIdempotency(ctx, data.EventID, "inventory.stock.decreased")
	if err != nil {
		return err
	}
	if isProcessed {
		log.Printf("[StockConsumer] Skipping duplicate event %s", data.EventID)
		return nil
	}

	if data.ProductID == 0 || data.Quantity == 0 {
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

	systemUserID := 1

	if err := c.stockService.MoveStock(ctx, systemUserID, req); err != nil {
		return err
	}

	log.Printf("[StockConsumer] Reduced stock for product ID %d by %d", data.ProductID, data.Quantity)
	return nil
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

	// Idempotency Check
	isProcessed, err := c.checkAndMarkIdempotency(ctx, data.EventID, "inventory.stock.returned")
	if err != nil {
		return err
	}
	if isProcessed {
		log.Printf("[StockConsumer] Skipping duplicate return event %s", data.EventID)
		return nil
	}

	if data.ProductID == 0 || data.Quantity == 0 {
		return nil
	}

	var qaLocationID int
	err = c.db.GetContext(ctx, &qaLocationID, "SELECT id FROM locations WHERE purpose = 'QA' LIMIT 1")
	if err != nil {
		log.Printf("[StockConsumer] No QA location found, fallback to location ID 1. Error: %v", err)
		qaLocationID = 1 // Fallback
	}

	req := inventory_dto.MoveStockRequest{
		ProductID:    data.ProductID,
		Quantity:     data.Quantity,
		MovementType: "RETURN_INBOUND",
		ToLocationID: &qaLocationID,
		Notes:        fmt.Sprintf("Auto Return: %s", data.Notes),
	}

	systemUserID := 1

	if err := c.stockService.MoveStock(ctx, systemUserID, req); err != nil {
		return err
	}

	log.Printf("[StockConsumer] Processed return for product ID %d by %d to location %d", data.ProductID, data.Quantity, qaLocationID)
	return nil
}
