package domain_test

import (
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
)

func TestStockTransaction_ProcessLine(t *testing.T) {
	st := &domain.StockTransaction{
		AssignedBuilding: "BLD-A",
	}

	err := st.AddDemand(1, 10)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	movementID := st.Movements[0].ID

	t.Run("Success", func(t *testing.T) {
		loc := &domain.Location{
			Building:            "BLD-A",
			Purpose:             "DISPLAY",
			IsFulfillmentSource: true,
		}
		err := st.ProcessLine(movementID, loc, 5, 99)
		if err != nil {
			t.Errorf("expected success, got %v", err)
		}
	})

	t.Run("Success Cross Building If Fulfillment Source", func(t *testing.T) {
		loc := &domain.Location{
			Building:            "BLD-B", // Different building but valid fulfillment source
			Purpose:             "DISPLAY",
			IsFulfillmentSource: true,
		}
		err := st.ProcessLine(movementID, loc, 5, 99)
		if err != nil {
			t.Errorf("expected success, got %v", err)
		}
	})

	t.Run("Fail Not Fulfillment Source", func(t *testing.T) {
		fresh := &domain.StockTransaction{AssignedBuilding: "BLD-A", Status: domain.TransactionStatusReadyToPick}
		if err := fresh.AddDemand(1, 10); err != nil {
			t.Fatalf("AddDemand failed: %v", err)
		}
		loc := &domain.Location{
			Building:            "BLD-A",
			Purpose:             "WAREHOUSE",
			IsFulfillmentSource: false,
		}
		err := fresh.ProcessLine(fresh.Movements[0].ID, loc, 5, 99)
		if err != domain.ErrInvalidLocationPurpose {
			t.Errorf("expected ErrInvalidLocationPurpose, got %v", err)
		}
	})

	t.Run("Fail Nil Scanned Location", func(t *testing.T) {
		fresh := &domain.StockTransaction{Status: domain.TransactionStatusReadyToPick}
		_ = fresh.AddDemand(1, 5)
		if err := fresh.ProcessLine(fresh.Movements[0].ID, nil, 1, 99); err != domain.ErrInvalidLocationPurpose {
			t.Errorf("expected ErrInvalidLocationPurpose for nil location, got %v", err)
		}
	})

	t.Run("Fail Completed Or Held Transaction", func(t *testing.T) {
		loc := &domain.Location{Building: "BLD-A", Purpose: "DISPLAY", IsFulfillmentSource: true}
		// st was completed by the previous two subtests (5 + 5 = 10)
		if err := st.ProcessLine(movementID, loc, 1, 99); err != domain.ErrTransactionNotPickable {
			t.Errorf("expected ErrTransactionNotPickable on completed trx, got %v", err)
		}

		held := &domain.StockTransaction{Status: domain.TransactionStatusHoldReplenishment}
		_ = held.AddDemand(1, 5)
		if err := held.ProcessLine(held.Movements[0].ID, loc, 1, 99); err != domain.ErrTransactionNotPickable {
			t.Errorf("expected ErrTransactionNotPickable on held trx, got %v", err)
		}
	})

	t.Run("Fail Already Completed Movement And Zero ProductID", func(t *testing.T) {
		loc := &domain.Location{Building: "BLD-A", Purpose: "DISPLAY", IsFulfillmentSource: true}
		multi := &domain.StockTransaction{Status: domain.TransactionStatusReadyToPick}
		if err := multi.AddDemand(0, 5); err != domain.ErrInvalidProductID {
			t.Fatalf("expected ErrInvalidProductID, got %v", err)
		}
		_ = multi.AddDemand(1, 5)
		_ = multi.AddDemand(2, 5)
		multi.Movements[0].ID = 10
		multi.Movements[1].ID = 20

		if err := multi.ProcessLine(10, loc, 5, 99); err != nil {
			t.Fatalf("first movement completion failed: %v", err)
		}
		if err := multi.ProcessLine(10, loc, 1, 99); err != domain.ErrMovementAlreadyCompleted {
			t.Errorf("expected ErrMovementAlreadyCompleted, got %v", err)
		}
	})
}

func TestStockLocation_AvailableQuantity(t *testing.T) {
	if got := (domain.StockLocation{Quantity: 10, ReservedQuantity: 4}).AvailableQuantity(); got != 6 {
		t.Fatalf("expected 6, got %d", got)
	}
	if got := (domain.StockLocation{Quantity: 2, ReservedQuantity: 5}).AvailableQuantity(); got != 0 {
		t.Fatalf("expected 0 when reserved exceeds quantity, got %d", got)
	}
}

func TestStockTransaction_HoldAndRelease(t *testing.T) {
	t.Run("MarkOnHoldForReplenishment sets status and serializes notes", func(t *testing.T) {
		st := &domain.StockTransaction{Status: domain.TransactionStatusPending}
		deficits := []domain.ReplenishmentDeficit{
			{
				ProductID:                10,
				SKU:                      "SKU-100",
				TargetQuantity:           10,
				DisplayAvailableQuantity: 2,
				DeficitQuantity:          8,
				SuggestedSources: []domain.SuggestedReplenishmentSource{
					{
						LocationID:        50,
						LocationCode:      "ST-01",
						Building:          "BLD-A",
						Purpose:           "STORAGE",
						AvailableQuantity: 20,
					},
				},
			},
		}

		err := st.MarkOnHoldForReplenishment(deficits)
		if err != nil {
			t.Fatalf("expected no error, got %v", err)
		}

		if st.Status != domain.TransactionStatusHoldReplenishment {
			t.Errorf("expected status %s, got %s", domain.TransactionStatusHoldReplenishment, st.Status)
		}

		if st.Notes == nil || *st.Notes == "" {
			t.Fatal("expected notes to contain serialized deficits")
		}

		if !st.CanBeReleased() {
			t.Errorf("expected CanBeReleased to be true")
		}
	})

	t.Run("MarkOutOfStock sets status and reason", func(t *testing.T) {
		st := &domain.StockTransaction{Status: domain.TransactionStatusPending}
		st.MarkOutOfStock("Insufficent total warehouse inventory")

		if st.Status != domain.TransactionStatusOutOfStock {
			t.Errorf("expected status %s, got %s", domain.TransactionStatusOutOfStock, st.Status)
		}

		if st.Notes == nil || *st.Notes != "Insufficent total warehouse inventory" {
			t.Errorf("expected notes with reason, got %v", st.Notes)
		}

		if !st.CanBeReleased() {
			t.Errorf("expected CanBeReleased to be true")
		}
	})

	t.Run("CanBeReleased returns false for COMPLETED or CANCELLED transactions", func(t *testing.T) {
		stCompleted := &domain.StockTransaction{Status: domain.TransactionStatusCompleted}
		if stCompleted.CanBeReleased() {
			t.Errorf("expected CanBeReleased false for COMPLETED")
		}

		stCancelled := &domain.StockTransaction{Status: domain.TransactionStatusCancelled}
		if stCancelled.CanBeReleased() {
			t.Errorf("expected CanBeReleased false for CANCELLED")
		}
	})
}
