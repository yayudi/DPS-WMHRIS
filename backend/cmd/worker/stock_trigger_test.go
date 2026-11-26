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
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping worker integration test; requires live DB and RabbitMQ")
	}

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get working directory: %v", err)
	}
	if err := os.Chdir("../../"); err != nil {
		t.Fatalf("Failed to change working directory: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(origDir)
	})

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
	defer func() {
		if container.EventBus != nil {
			_ = container.EventBus.Close()
		}
	}()

	eventBus := container.EventBus

	ctx := context.Background()
	event := eventbus.NewEvent("inventory.stock.increased", map[string]any{
		"product_id": 1,
	}, 1)

	t.Log("Publishing inventory.stock.increased event...")
	if err := eventBus.Publish(ctx, event); err != nil {
		t.Fatalf("Failed to publish event: %v", err)
	}

	t.Log("Event published successfully.")
}
