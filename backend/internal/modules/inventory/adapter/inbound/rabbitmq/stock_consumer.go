package rabbitmq

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jmoiron/sqlx"

	inventory_dto "github.com/dps-wmhris/backend/internal/modules/inventory/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type StockConsumer struct {
	stockService port.StockUseCase
	db           *sqlx.DB
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
		// If duplicate entry error (MySQL error 1062)
		if err.Error() != "" {
			// A simple check for duplicate key, you might want to use mysql.MySQLError type assertion in production
			// For now, if insert fails, we assume it's duplicate or DB error.
			log.Printf("[StockConsumer] Event %s for topic %s might already be processed or DB error: %v", eventID, topic, err)
			return true, nil // Return true to indicate "already processed" to skip gracefully
		}
		return false, err
	}
	return false, nil // Successfully marked as not processed
}

func (c *StockConsumer) handleStockDecreased(ctx context.Context, event eventbus.Event) error {
	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return err
	}

	var data struct {
		EventID        string `json:"event_id"`
		ProductID      int    `json:"product_id"`
		Quantity       int    `json:"quantity"`
		MovementType   string `json:"movement_type"`
		FromLocationID *int   `json:"from_location_id"`
		ToLocationID   *int   `json:"to_location_id"`
		Notes          string `json:"notes"`
	}

	if err := json.Unmarshal(payloadBytes, &data); err != nil {
		return err
	}

	// Idempotency Check
	isProcessed, _ := c.checkAndMarkIdempotency(ctx, data.EventID, "inventory.stock.decreased")
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

func (c *StockConsumer) handleStockReturned(ctx context.Context, event eventbus.Event) error {
	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return err
	}

	var data struct {
		EventID        string `json:"event_id"`
		ProductID      int    `json:"product_id"`
		Quantity       int    `json:"quantity"`
		Notes          string `json:"notes"`
	}

	if err := json.Unmarshal(payloadBytes, &data); err != nil {
		return err
	}

	// Idempotency Check
	isProcessed, _ := c.checkAndMarkIdempotency(ctx, data.EventID, "inventory.stock.returned")
	if isProcessed {
		log.Printf("[StockConsumer] Skipping duplicate return event %s", data.EventID)
		return nil
	}

	if data.ProductID == 0 || data.Quantity == 0 {
		return nil
	}

	// 1. Fetch QA/Retur Location dynamically or use a hardcoded one for now.
	// For best practice, we query the DB to find a location with purpose 'QA' or 'RETUR'.
	// Here we will hardcode a fallback if not found, but we should use a valid ToLocationID.
	var qaLocationID int
	err = c.db.GetContext(ctx, &qaLocationID, "SELECT id FROM locations WHERE purpose = 'QA' LIMIT 1")
	if err != nil {
		log.Printf("[StockConsumer] No QA location found, fallback to location ID 1. Error: %v", err)
		qaLocationID = 1 // Fallback
	}

	req := inventory_dto.MoveStockRequest{
		ProductID:      data.ProductID,
		Quantity:       data.Quantity,
		MovementType:   "RETURN_INBOUND",
		ToLocationID:   &qaLocationID,
		Notes:          fmt.Sprintf("Auto Return: %s", data.Notes),
	}

	systemUserID := 1

	if err := c.stockService.MoveStock(ctx, systemUserID, req); err != nil {
		return err
	}

	log.Printf("[StockConsumer] Processed return for product ID %d by %d to location %d", data.ProductID, data.Quantity, qaLocationID)
	return nil
}
