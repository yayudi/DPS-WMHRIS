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
		loc := &domain.Location{
			Building:            "BLD-A",
			Purpose:             "WAREHOUSE",
			IsFulfillmentSource: false,
		}
		err := st.ProcessLine(movementID, loc, 5, 99)
		if err != domain.ErrInvalidLocationPurpose {
			t.Errorf("expected ErrInvalidLocationPurpose, got %v", err)
		}
	})
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
