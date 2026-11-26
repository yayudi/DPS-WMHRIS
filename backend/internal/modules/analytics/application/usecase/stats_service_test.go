package usecase

import (
	"context"
	"testing"
	"time"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
)

type mockStatsRepository struct {
	pulse     analytics_dto.OperationalPulseDTO
	invValue  float64
	skuRows   []analytics_dto.SkuHealthInputRow
	dupLocs   []analytics_dto.DuplicateProductLocation
	topLocs   []analytics_dto.TopLocationWatchItem
	trendRows []analytics_dto.DailyMovementPointDTO
	buildings []analytics_dto.BuildingStockSummaryDTO
}

func (m *mockStatsRepository) GetOperationalPulseKpi(_ context.Context) (analytics_dto.OperationalPulseDTO, error) {
	return m.pulse, nil
}

func (m *mockStatsRepository) GetInventoryValueKpi(_ context.Context) (float64, error) {
	return m.invValue, nil
}

func (m *mockStatsRepository) GetSkuHealthRows(_ context.Context) ([]analytics_dto.SkuHealthInputRow, error) {
	return m.skuRows, nil
}

func (m *mockStatsRepository) GetDuplicateLocationWatchlist(_ context.Context, _ int) ([]analytics_dto.DuplicateProductLocation, error) {
	return m.dupLocs, nil
}

func (m *mockStatsRepository) GetTopLoadedLocationWatchlist(_ context.Context, _ int) ([]analytics_dto.TopLocationWatchItem, error) {
	return m.topLocs, nil
}

func (m *mockStatsRepository) GetDailyMovementTrend(_ context.Context, _ int) ([]analytics_dto.DailyMovementPointDTO, error) {
	return m.trendRows, nil
}

func (m *mockStatsRepository) GetBuildingDistribution(_ context.Context) ([]analytics_dto.BuildingStockSummaryDTO, error) {
	return m.buildings, nil
}

func TestGetKpiSummary_AggregatesHealthWatchlistAnd14DayTrend(t *testing.T) {
	repo := &mockStatsRepository{
		pulse: analytics_dto.OperationalPulseDTO{
			OutboundToday:       120,
			OutboundYesterday:   80,
			InboundToday:        200,
			TransferToday:       45,
			ListsCompletedToday: 12,
			UsersActiveToday:    6,
			PendingStockRequests: 3,
			TotalActiveSkus:     6,
		},
		invValue: 15000000,
		skuRows: []analytics_dto.SkuHealthInputRow{
			{ProductID: 1, SKU: "CRIT-1", Name: "Critical One", CurrentStock: 10, Sold30d: 150},   // DOI 2.0 -> Critical
			{ProductID: 2, SKU: "CRIT-2", Name: "Critical Two", CurrentStock: 20, Sold30d: 120},   // DOI 5.0 -> Critical
			{ProductID: 3, SKU: "WARN-1", Name: "Warning One", CurrentStock: 40, Sold30d: 120},    // DOI 10.0 -> Warning
			{ProductID: 4, SKU: "DEAD-1", Name: "Overstock", CurrentStock: 250, Sold30d: 0},       // Dead/Overstock
			{ProductID: 5, SKU: "EMPTY-1", Name: "Empty SKU", CurrentStock: 0, Sold30d: 30},       // Empty
			{ProductID: 6, SKU: "NEG-1", Name: "Negative SKU", CurrentStock: -2, Sold30d: 0},      // Negative
			{ProductID: 7, SKU: "SAFE-1", Name: "Safe SKU", CurrentStock: 500, Sold30d: 300},      // DOI 50.0 -> Safe
		},
		trendRows: []analytics_dto.DailyMovementPointDTO{
			{Date: "2026-11-24", TotalInbound: 200, TotalOutbound: 120, TotalTransfer: 45},
		},
	}

	svc := &statsServiceImpl{
		statsRepo: repo,
		nowFunc: func() time.Time {
			return time.Date(2026, 11, 24, 15, 0, 0, 0, time.UTC)
		},
	}

	res, err := svc.GetKpiSummary(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.Pulse.TotalInventoryValue != 15000000 || res.TotalInventoryValue != 15000000 {
		t.Fatalf("expected inventory value 15000000, got %v", res.Pulse.TotalInventoryValue)
	}
	if res.StockHealth.CriticalCount != 2 || res.StockHealth.WarningCount != 1 || res.StockHealth.DeadOverstockCount != 1 || res.StockHealth.EmptyCount != 1 || res.StockHealth.NegativeCount != 1 || res.StockHealth.SafeCount != 1 {
		t.Fatalf("unexpected stock health counts: %+v", res.StockHealth)
	}
	if len(res.Watchlist.CriticalSkus) != 2 || res.Watchlist.CriticalSkus[0].SKU != "CRIT-1" || res.Watchlist.CriticalSkus[0].DaysOfInventory != 2.0 {
		t.Fatalf("unexpected critical SKU watchlist: %+v", res.Watchlist.CriticalSkus)
	}
	if len(res.MovementTrend) != 14 {
		t.Fatalf("expected 14 daily points, got %d", len(res.MovementTrend))
	}
	if res.MovementTrend[13].Date != "2026-11-24" || res.MovementTrend[13].TotalOutbound != 120 {
		t.Fatalf("unexpected latest trend point: %+v", res.MovementTrend[13])
	}
	if res.Watchlist.DuplicateLocations == nil || res.Watchlist.TopLoadedLocations == nil || res.BuildingDistribution == nil {
		t.Fatal("expected non-nil empty slices in dashboard response")
	}
}
