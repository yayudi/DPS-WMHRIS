// Package usecase implements analytics business use cases.
package usecase

import (
	"context"
	"math"
	"sort"
	"sync"
	"time"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"

	analytics_mysql "github.com/dps-wmhris/backend/internal/modules/analytics/adapter/outbound/mysql"
)

const (
	dashboardWatchlistLimit = 5
	dashboardTrendDays      = 14
	doiWindowDays           = 30.0
)

// StatsService defines use cases for the analytics command center dashboard.
type StatsService interface {
	GetKpiSummary(ctx context.Context) (analytics_dto.KpiSummaryResponse, error)
}

type statsServiceImpl struct {
	statsRepo analytics_mysql.StatsRepository
	nowFunc   func() time.Time
}

// NewStatsService creates a new StatsService instance.
func NewStatsService(statsRepo analytics_mysql.StatsRepository) StatsService {
	return &statsServiceImpl{
		statsRepo: statsRepo,
		nowFunc:   time.Now,
	}
}

// GetKpiSummary fetches command center pulses, 30-day stock health, top-5 watchlists, and 14-day movement trends concurrently.
func (s *statsServiceImpl) GetKpiSummary(ctx context.Context) (analytics_dto.KpiSummaryResponse, error) {
	var (
		pulse      analytics_dto.OperationalPulseDTO
		invValue   float64
		healthRows []analytics_dto.SkuHealthInputRow
		dupLocs    []analytics_dto.DuplicateProductLocation
		topLocs    []analytics_dto.TopLocationWatchItem
		trendRows  []analytics_dto.DailyMovementPointDTO
		buildings  []analytics_dto.BuildingStockSummaryDTO

		errPulse     error
		errInv       error
		errHealth    error
		errDup       error
		errTopLoc    error
		errTrend     error
		errBuildings error
	)

	var wg sync.WaitGroup
	wg.Add(7)

	go func() { defer wg.Done(); pulse, errPulse = s.statsRepo.GetOperationalPulseKpi(ctx) }()
	go func() { defer wg.Done(); invValue, errInv = s.statsRepo.GetInventoryValueKpi(ctx) }()
	go func() { defer wg.Done(); healthRows, errHealth = s.statsRepo.GetSkuHealthRows(ctx) }()
	go func() {
		defer wg.Done()
		dupLocs, errDup = s.statsRepo.GetDuplicateLocationWatchlist(ctx, dashboardWatchlistLimit)
	}()
	go func() {
		defer wg.Done()
		topLocs, errTopLoc = s.statsRepo.GetTopLoadedLocationWatchlist(ctx, dashboardWatchlistLimit)
	}()
	go func() {
		defer wg.Done()
		trendRows, errTrend = s.statsRepo.GetDailyMovementTrend(ctx, dashboardTrendDays)
	}()
	go func() { defer wg.Done(); buildings, errBuildings = s.statsRepo.GetBuildingDistribution(ctx) }()

	wg.Wait()

	for _, err := range []error{errPulse, errInv, errHealth, errDup, errTopLoc, errTrend, errBuildings} {
		if err != nil {
			return analytics_dto.KpiSummaryResponse{}, err
		}
	}

	pulse.TotalInventoryValue = invValue
	stockHealth, criticalSkus := classifyStockHealthAndCritical(healthRows, dashboardWatchlistLimit)

	if dupLocs == nil {
		dupLocs = []analytics_dto.DuplicateProductLocation{}
	}
	if topLocs == nil {
		topLocs = []analytics_dto.TopLocationWatchItem{}
	}
	if buildings == nil {
		buildings = []analytics_dto.BuildingStockSummaryDTO{}
	}

	normalizedTrend := fillDailyTrendGaps(s.nowFunc(), dashboardTrendDays, trendRows)

	return analytics_dto.KpiSummaryResponse{
		ListsCompletedToday: pulse.ListsCompletedToday,
		ItemsPickedToday:    int(math.Round(pulse.OutboundToday)),
		UsersActiveToday:    pulse.UsersActiveToday,
		TotalInventoryValue: invValue,
		Pulse:               pulse,
		StockHealth:         stockHealth,
		Watchlist: analytics_dto.DashboardWatchlistDTO{
			CriticalSkus:       criticalSkus,
			DuplicateLocations: dupLocs,
			TopLoadedLocations: topLocs,
		},
		MovementTrend:        normalizedTrend,
		BuildingDistribution: buildings,
	}, nil
}

func classifyStockHealthAndCritical(rows []analytics_dto.SkuHealthInputRow, criticalLimit int) (analytics_dto.StockHealthSummaryDTO, []analytics_dto.CriticalSkuWatchItem) {
	var summary analytics_dto.StockHealthSummaryDTO
	criticalCandidates := make([]analytics_dto.CriticalSkuWatchItem, 0)

	for _, row := range rows {
		avgDailySales := row.Sold30d / doiWindowDays
		if row.CurrentStock < 0 {
			summary.NegativeCount++
			continue
		}
		if row.CurrentStock == 0 {
			summary.EmptyCount++
			continue
		}

		if avgDailySales > 0 {
			doi := math.Round((row.CurrentStock/avgDailySales)*10) / 10
			if doi <= 7 {
				summary.CriticalCount++
				criticalCandidates = append(criticalCandidates, analytics_dto.CriticalSkuWatchItem{
					ProductID:       row.ProductID,
					SKU:             row.SKU,
					Name:            row.Name,
					CurrentStock:    row.CurrentStock,
					Sold30d:         row.Sold30d,
					AvgDailySales:   math.Round(avgDailySales*100) / 100,
					DaysOfInventory: doi,
				})
			} else if doi <= 14 {
				summary.WarningCount++
			} else {
				summary.SafeCount++
			}
			continue
		}

		if row.CurrentStock >= 100 {
			summary.DeadOverstockCount++
		} else {
			summary.SafeCount++
		}
	}

	sort.Slice(criticalCandidates, func(i, j int) bool {
		if criticalCandidates[i].DaysOfInventory == criticalCandidates[j].DaysOfInventory {
			return criticalCandidates[i].Sold30d > criticalCandidates[j].Sold30d
		}
		return criticalCandidates[i].DaysOfInventory < criticalCandidates[j].DaysOfInventory
	})

	if len(criticalCandidates) > criticalLimit {
		criticalCandidates = criticalCandidates[:criticalLimit]
	}

	return summary, criticalCandidates
}

func fillDailyTrendGaps(now time.Time, days int, rows []analytics_dto.DailyMovementPointDTO) []analytics_dto.DailyMovementPointDTO {
	byDate := make(map[string]analytics_dto.DailyMovementPointDTO, len(rows))
	for _, r := range rows {
		byDate[r.Date] = r
	}

	result := make([]analytics_dto.DailyMovementPointDTO, 0, days)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	for i := days - 1; i >= 0; i-- {
		dateStr := today.AddDate(0, 0, -i).Format("2006-01-02")
		if existing, ok := byDate[dateStr]; ok {
			result = append(result, existing)
		} else {
			result = append(result, analytics_dto.DailyMovementPointDTO{Date: dateStr})
		}
	}
	return result
}
