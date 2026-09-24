package main

import (
	"context"
	"os"
	"testing"

	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

func TestTriggerStock(t *testing.T) {
	os.Chdir("../../")
	config.LoadConfig() 
	
	db := database.ConnectDB()
	if db == nil {
		t.Fatal("Failed to connect to database")
	}
	defer db.Close()

	container, err := InitializeWorker(db)
	if err != nil {
		t.Fatalf("Failed to initialize worker container: %v", err)
	}

	eventBus := container.EventBus

	ctx := context.Background()
	event := eventbus.NewEvent("inventory.stock.increased", map[string]interface{}{
		"product_id": 1,
	}, 1) // UserID bebas

	t.Log("Publishing inventory.stock.increased event...")
	err = eventBus.Publish(ctx, event)
	if err != nil {
		t.Fatalf("Failed to publish event: %v", err)
	}

	t.Log("Event published successfully.")
}
