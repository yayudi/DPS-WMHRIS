package rabbitmq

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/inventory/port"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type StockConsumer struct {
	fulfilmentService port.FulfilmentUseCase
}

func NewStockConsumer(fulfilmentService port.FulfilmentUseCase) *StockConsumer {
	return &StockConsumer{
		fulfilmentService: fulfilmentService,
	}
}

func (c *StockConsumer) RegisterHandlers(bus eventbus.EventBus) error {
	return bus.Subscribe("inventory.stock.increased", c.handleStockIncreased)
}

func (c *StockConsumer) handleStockIncreased(ctx context.Context, event eventbus.Event) error {
	// Parse payload
	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		log.Printf("[StockConsumer] Failed to parse payload: %v", err)
		return err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &data); err != nil {
		log.Printf("[StockConsumer] Failed to decode payload: %v", err)
		return err
	}

	productIDFloat, ok := data["product_id"].(float64)
	if !ok {
		log.Printf("[StockConsumer] Invalid or missing product_id in payload")
		return nil
	}
	productID := int(productIDFloat)

	// Beri nafas sekitar 500 milidetik agar Transaksi API Inbound benar-benar di-commit ke MySQL
	// sebelum Worker mengeksekusi pencarian stok, untuk menghindari fenomena 'Race Condition'
	time.Sleep(500 * time.Millisecond)

	// Execute Auto Recovery Backorders
	err = c.fulfilmentService.AutoRecoverBackorderByProductID(ctx, productID)
	if err != nil {
		log.Printf("[StockConsumer] Error auto-recovering backorder for product ID %d: %v", productID, err)
		return err
	}
	log.Printf("[StockConsumer] Successfully ran auto-recovery backorder for product ID %d", productID)
	return nil
}
