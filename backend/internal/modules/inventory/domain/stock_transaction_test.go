package domain_test

import (
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/inventory/domain"
)

func TestStockTransaction_FulfillLine(t *testing.T) {
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
			Building: "BLD-A",
			Purpose:  "WAREHOUSE",
		}
		err := st.FulfillLine(movementID, loc, 5, 99)
		if err != nil {
			t.Errorf("expected success, got %v", err)
		}
	})

	t.Run("Fail Cross Building", func(t *testing.T) {
		loc := &domain.Location{
			Building: "BLD-B", // Different building
			Purpose:  "WAREHOUSE",
		}
		err := st.FulfillLine(movementID, loc, 5, 99)
		if err != domain.ErrCrossBuildingFulfilment {
			t.Errorf("expected ErrCrossBuildingFulfilment, got %v", err)
		}
	})

	t.Run("Fail Wrong Purpose", func(t *testing.T) {
		loc := &domain.Location{
			Building: "BLD-A",
			Purpose:  "QA", // Not WAREHOUSE or DISPLAY
		}
		err := st.FulfillLine(movementID, loc, 5, 99)
		if err != domain.ErrInvalidLocationPurpose {
			t.Errorf("expected ErrInvalidLocationPurpose, got %v", err)
		}
	})
}
