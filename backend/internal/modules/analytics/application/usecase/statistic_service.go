package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	analytics_port "github.com/dps-wmhris/backend/internal/modules/analytics/port"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	system_port "github.com/dps-wmhris/backend/internal/modules/system/port"
)

// StatisticService is a compatibility alias for analytics/port.StatisticService.
type StatisticService = analytics_port.StatisticService

type statisticServiceImpl struct {
	repo       analytics_port.StatisticRepository
	jobService system_port.JobService
}

// NewStatisticService creates a StatisticService wired with StatisticRepository and JobService.
func NewStatisticService(repo analytics_port.StatisticRepository, jobService system_port.JobService) analytics_port.StatisticService {
	return &statisticServiceImpl{
		repo:       repo,
		jobService: jobService,
	}
}

func parseDate(dateStr string) time.Time {
	t, _ := time.Parse("2006-01-02", dateStr)
	return t
}

func (s *statisticServiceImpl) GetStockMovementStatistics(ctx context.Context, filters analytics_dto.StatisticFilterRequest) (*analytics_dto.StockMovementResponse, error) {
	var summaryRows []analytics_dto.StockMovementSummaryResponse
	var timelineRows []analytics_dto.StockMovementTimelineResponse
	var errSummary error
	var errTimeline error

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		summaryRows, errSummary = s.repo.GetStockMovementStats(ctx, filters)
	}()

	go func() {
		defer wg.Done()
		timelineRows, errTimeline = s.repo.GetMovementTimelineStats(ctx, filters)
	}()

	wg.Wait()

	if errSummary != nil {
		return nil, errSummary
	}
	if errTimeline != nil {
		return nil, errTimeline
	}

	start := parseDate(filters.StartDate)
	end := parseDate(filters.EndDate)
	diffTime := end.Sub(start).Hours() / 24
	days := math.Floor(math.Abs(diffTime)) + 1
	if days <= 0 {
		days = 1
	}

	formattedSummary := make([]analytics_dto.StockMovementSummaryResponse, 0, len(summaryRows))
	for _, row := range summaryRows {
		avgDailySales := row.TotalSold / days
		currentStock := row.CurrentStock
		var daysOfInventory *float64
		if avgDailySales > 0 {
			val := math.Round((currentStock/avgDailySales)*10) / 10
			daysOfInventory = &val
		} else {
			val := -1.0
			daysOfInventory = &val
		}

		status := "SAFE"
		if currentStock < 0 {
			status = "NEGATIVE"
		} else if currentStock == 0 {
			status = "EMPTY"
		} else if *daysOfInventory >= 0 && *daysOfInventory <= 7 {
			status = "CRITICAL"
		} else if *daysOfInventory > 7 && *daysOfInventory <= 14 {
			status = "WARNING"
		} else if *daysOfInventory == -1 && currentStock >= 100 {
			status = "OVERSTOCK"
		}

		row.AvgDailySales = math.Round(avgDailySales*100) / 100
		row.DaysOfInventory = daysOfInventory
		row.Status = status

		formattedSummary = append(formattedSummary, row)
	}

	if filters.Status != "" && filters.Status != "all" {
		var inc, exc []string
		v := filters.Status
		var parsed map[string]any
		if err := json.Unmarshal([]byte(v), &parsed); err == nil {
			if parsedInc, ok := parsed["include"]; ok {
				inc = toSliceOfStrings(parsedInc)
			}
			if parsedExc, ok := parsed["exclude"]; ok {
				exc = toSliceOfStrings(parsedExc)
			}
		} else {
			inc = append(inc, strings.ToUpper(v))
		}

		if len(inc) > 0 || len(exc) > 0 {
			incSet := make(map[string]bool, len(inc))
			for _, st := range inc {
				incSet[strings.ToUpper(st)] = true
			}
			excSet := make(map[string]bool, len(exc))
			for _, st := range exc {
				excSet[strings.ToUpper(st)] = true
			}

			filtered := make([]analytics_dto.StockMovementSummaryResponse, 0, len(formattedSummary))
			for _, item := range formattedSummary {
				if len(incSet) > 0 && !incSet[item.Status] {
					continue
				}
				if excSet[item.Status] {
					continue
				}
				filtered = append(filtered, item)
			}
			formattedSummary = filtered
		}
	}

	if filters.Movement != "" && filters.Movement != "all" {
		filtered := make([]analytics_dto.StockMovementSummaryResponse, 0, len(formattedSummary))
		for _, item := range formattedSummary {
			switch filters.Movement {
			case "active":
				if item.TotalSold > 0 || item.TotalInbound > 0 {
					filtered = append(filtered, item)
				}
			case "dead":
				if item.TotalSold == 0 && item.TotalInbound == 0 {
					filtered = append(filtered, item)
				}
			}
		}
		formattedSummary = filtered
	}

	if timelineRows == nil {
		timelineRows = []analytics_dto.StockMovementTimelineResponse{}
	}

	return &analytics_dto.StockMovementResponse{
		Summary:  formattedSummary,
		Timeline: timelineRows,
	}, nil
}

func (s *statisticServiceImpl) RequestStockMovementsExport(ctx context.Context, userID int, req analytics_dto.ExportStatisticRequest) (int, error) {
	filtersJSON, err := json.Marshal(map[string]any{
		"startDate":   req.StartDate,
		"endDate":     req.EndDate,
		"searchQuery": req.SearchQuery,
		"status":      req.Status,
		"movement":    req.Movement,
		"building":    req.Building,
		"buildings":   req.Building,
		"categoryId":  req.CategoryId,
		"exportType":  "STATISTICS_STOCK_MOVEMENT",
		"exportName":  req.ExportName,
	})
	if err != nil {
		return 0, fmt.Errorf("failed to marshal stock movements export filters: %w", err)
	}
	fString := string(filtersJSON)

	return s.jobService.CreateExportJob(ctx, system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "STATISTICS_STOCK_MOVEMENT",
		Filters: &fString,
	})
}

func (s *statisticServiceImpl) GetStockTimelineStatistics(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.StockTimelineResponse, error) {
	rows, err := s.repo.GetMovementTimelineStats(ctx, filters)
	if err != nil {
		return nil, err
	}

	data := make([]analytics_dto.StockTimelineResponse, 0, len(rows))
	for _, r := range rows {
		data = append(data, analytics_dto.StockTimelineResponse{
			Date:      r.Date,
			TotalIn:   r.TotalIn,
			TotalOut:  r.TotalOut,
			NetChange: r.TotalIn - r.TotalOut,
		})
	}
	return data, nil
}

func (s *statisticServiceImpl) RequestStockTimelineExport(ctx context.Context, userID int, req analytics_dto.ExportTimelineRequest) (int, error) {
	status := "all"
	if req.Status != nil {
		if statusStr, ok := req.Status.(string); ok {
			status = statusStr
		}
	}
	movement := "all"
	if req.Movement != "" {
		movement = req.Movement
	}

	filtersJSON, err := json.Marshal(map[string]any{
		"searchQuery": req.SearchQuery,
		"status":      status,
		"movement":    movement,
		"building":    req.Building,
		"buildings":   req.Building,
		"exportType":  "STATISTICS_STOCK_TIMELINE",
		"exportName":  req.ExportName,
	})
	if err != nil {
		return 0, fmt.Errorf("failed to marshal stock timeline export filters: %w", err)
	}
	fString := string(filtersJSON)

	return s.jobService.CreateExportJob(ctx, system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "STATISTICS_STOCK_TIMELINE",
		Filters: &fString,
	})
}

func (s *statisticServiceImpl) GetInventoryValueStatistics(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.InventoryValueResponse, error) {
	rows, err := s.repo.GetInventoryValueStats(ctx, filters)
	if err != nil {
		return nil, err
	}

	var globalTotalValue float64
	for _, row := range rows {
		globalTotalValue += row.TotalValue
	}

	data := make([]analytics_dto.InventoryValueResponse, 0, len(rows))
	for _, row := range rows {
		var percentage float64
		if globalTotalValue > 0 {
			percentage = (row.TotalValue / globalTotalValue) * 100
		}
		row.Percentage = math.Round(percentage*100) / 100

		switch {
		case row.TotalQuantity < 0:
			row.Status = "NEGATIVE"
		case row.TotalQuantity == 0:
			row.Status = "EMPTY"
		case row.TotalQuantity >= 100:
			row.Status = "OVERSTOCK"
		case row.TotalQuantity >= 50:
			row.Status = "WARNING"
		default:
			row.Status = "CRITICAL"
		}

		data = append(data, row)
	}

	return data, nil
}

func (s *statisticServiceImpl) GetShopPerformanceStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) (*analytics_dto.ShopPerformanceResponse, error) {
	var summary []analytics_dto.ShopPerformanceSummary
	var trend []analytics_dto.DailySalesTrend
	var topProducts []analytics_dto.TopSellingProduct
	var health []analytics_dto.FulfillmentHealth
	var comp []analytics_dto.PeriodComparison

	var errs [5]error
	var wg sync.WaitGroup

	wg.Add(4)
	go func() {
		defer wg.Done()
		summary, errs[0] = s.repo.GetShopPerformanceStats(ctx, filters)
	}()
	go func() {
		defer wg.Done()
		trend, errs[1] = s.repo.GetDailySalesTrend(ctx, filters)
	}()
	go func() {
		defer wg.Done()
		topProducts, errs[2] = s.repo.GetTopSellingProducts(ctx, filters, 10)
	}()
	go func() {
		defer wg.Done()
		health, errs[3] = s.repo.GetFulfillmentHealth(ctx, filters)
	}()

	if filters.PrevStartDate != "" && filters.PrevEndDate != "" {
		wg.Add(1)
		go func() {
			defer wg.Done()
			comp, errs[4] = s.repo.GetPeriodComparison(ctx, filters)
		}()
	}

	wg.Wait()

	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}

	for i, h := range health {
		if h.TotalOrders > 0 {
			health[i].CompletionRate = math.Round((h.CompletedOrders/h.TotalOrders)*1000) / 10
			health[i].CancellationRate = math.Round((h.CancelledOrders/h.TotalOrders)*1000) / 10
			health[i].ReturnRate = math.Round((h.ReturnedOrders/h.TotalOrders)*1000) / 10
		}
	}

	resp := &analytics_dto.ShopPerformanceResponse{
		Summary:     summary,
		DailyTrend:  trend,
		TopProducts: topProducts,
		Fulfillment: health,
	}

	if resp.Summary == nil {
		resp.Summary = []analytics_dto.ShopPerformanceSummary{}
	}
	if resp.DailyTrend == nil {
		resp.DailyTrend = []analytics_dto.DailySalesTrend{}
	}
	if resp.TopProducts == nil {
		resp.TopProducts = []analytics_dto.TopSellingProduct{}
	}
	if resp.Fulfillment == nil {
		resp.Fulfillment = []analytics_dto.FulfillmentHealth{}
	}

	if filters.PrevStartDate != "" && filters.PrevEndDate != "" && len(comp) > 0 {
		c := comp[0]
		calcDelta := func(curr, prev float64) float64 {
			if prev > 0 {
				return math.Round(((curr-prev)/prev)*1000) / 10
			} else if curr > 0 {
				return 100
			}
			return 0
		}
		c.Delta.TotalOrders = calcDelta(c.Current.TotalOrders, c.Previous.TotalOrders)
		c.Delta.TotalItemsSold = calcDelta(c.Current.TotalItemsSold, c.Previous.TotalItemsSold)
		c.Delta.TotalRevenue = calcDelta(c.Current.TotalRevenue, c.Previous.TotalRevenue)
		resp.Comparison = &c
	}

	return resp, nil
}

func (s *statisticServiceImpl) GetPackageComponentAnalysis(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.PackageComponentAnalysisResponse, error) {
	rows, err := s.repo.GetPackageComponentAnalysis(ctx, filters)
	if err != nil {
		return nil, err
	}

	pIncludeSet := make(map[int]bool)
	pExcludeSet := make(map[int]bool)
	if filters.PackageCategoryId != "" {
		var parsed map[string][]int
		if err := json.Unmarshal([]byte(filters.PackageCategoryId), &parsed); err == nil {
			for _, id := range parsed["include"] {
				pIncludeSet[id] = true
			}
			for _, id := range parsed["exclude"] {
				pExcludeSet[id] = true
			}
		}
	}

	compMap := make(map[int]*analytics_dto.PackageComponentAnalysisResponse)

	for _, row := range rows {
		cmpID := row.ComponentProductID
		if _, exists := compMap[cmpID]; !exists {
			compMap[cmpID] = &analytics_dto.PackageComponentAnalysisResponse{
				ComponentProductID: cmpID,
				SKU:                row.ComponentSKU,
				Name:               row.ComponentName,
				CategoryID:         row.ComponentCategoryID,
				CurrentStock:       row.CurrentStock,
				TotalNeeded:        0,
				Packages:           []analytics_dto.PackageComponentPackageInfo{},
			}
		}

		comp := compMap[cmpID]
		pid := row.PackageCategoryID

		includePackage := true
		if len(pIncludeSet) > 0 {
			includePackage = pid != nil && pIncludeSet[*pid]
		}
		if includePackage && len(pExcludeSet) > 0 && pid != nil && pExcludeSet[*pid] {
			includePackage = false
		}

		if includePackage {
			comp.Packages = append(comp.Packages, analytics_dto.PackageComponentPackageInfo{
				PackageSKU:        row.PackageSKU,
				PackageName:       row.PackageName,
				PackageCategoryID: row.PackageCategoryID,
				Sold:              row.Sold,
				QtyPerPackage:     row.QtyPerPackage,
				SubtotalNeeded:    row.SubtotalNeeded,
			})
			comp.TotalNeeded += row.SubtotalNeeded
		}
	}

	sIncludeSet := make(map[string]bool)
	sExcludeSet := make(map[string]bool)
	if filters.StockStatus != "" {
		var parsed map[string][]string
		if err := json.Unmarshal([]byte(filters.StockStatus), &parsed); err == nil {
			for _, st := range parsed["include"] {
				sIncludeSet[st] = true
			}
			for _, st := range parsed["exclude"] {
				sExcludeSet[st] = true
			}
		}
	}

	data := make([]analytics_dto.PackageComponentAnalysisResponse, 0, len(compMap))
	for _, comp := range compMap {
		deficit := comp.TotalNeeded - comp.CurrentStock
		comp.Deficit = deficit

		status := "SAFE"
		if deficit > 0 || (comp.CurrentStock == 0 && comp.TotalNeeded > 0) {
			status = "DEFICIT"
		} else if deficit <= 0 && deficit >= -20 {
			status = "WARNING"
		}
		comp.Status = status

		if comp.TotalNeeded == 0 {
			continue
		}

		if len(sIncludeSet) > 0 && !sIncludeSet[comp.Status] {
			continue
		}
		if sExcludeSet[comp.Status] {
			continue
		}

		data = append(data, *comp)
	}

	// O(n log n) deterministic sort by TotalNeeded DESC, SKU ASC
	sort.Slice(data, func(i, j int) bool {
		if data[i].TotalNeeded == data[j].TotalNeeded {
			return data[i].SKU < data[j].SKU
		}
		return data[i].TotalNeeded > data[j].TotalNeeded
	})

	return data, nil
}

func (s *statisticServiceImpl) RequestLocationCapacityExport(ctx context.Context, userID int, req analytics_dto.ExportLocationCapacityRequest) (int, error) {
	filtersJSON, err := json.Marshal(map[string]any{
		"searchQuery":  req.SearchQuery,
		"categoryId":   req.CategoryId,
		"purpose":      req.Purpose,
		"building":     req.Building,
		"floor":        req.Floor,
		"exportType":   "STATISTICS_LOCATION_CAPACITY",
		"exportName":   req.ExportName,
		"exportFormat": req.ExportFormat,
	})
	if err != nil {
		return 0, fmt.Errorf("failed to marshal location capacity export filters: %w", err)
	}
	fString := string(filtersJSON)

	return s.jobService.CreateExportJob(ctx, system_dto.CreateExportJobRequest{
		UserID:  userID,
		JobType: "STATISTICS_LOCATION_CAPACITY",
		Filters: &fString,
	})
}

func (s *statisticServiceImpl) GetLocationAnalysis(ctx context.Context, filters analytics_dto.StatisticFilterRequest) (*analytics_dto.LocationAnalysisResponse, error) {
	var loads []analytics_dto.LocationLoad
	var dups []analytics_dto.DuplicateProductLocation
	var err1, err2 error

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		loads, err1 = s.repo.GetLocationLoads(ctx, filters)
	}()
	go func() {
		defer wg.Done()
		dups, err2 = s.repo.GetDuplicateLocations(ctx, filters)
	}()

	wg.Wait()

	if err1 != nil {
		return nil, err1
	}
	if err2 != nil {
		return nil, err2
	}

	if loads == nil {
		loads = []analytics_dto.LocationLoad{}
	}
	if dups == nil {
		dups = []analytics_dto.DuplicateProductLocation{}
	}

	return &analytics_dto.LocationAnalysisResponse{
		LocationLoads:     loads,
		DuplicateProducts: dups,
	}, nil
}

func (s *statisticServiceImpl) GetLocationCapacityDetails(ctx context.Context, locationID int, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationCapacityDetailResponse, error) {
	return s.repo.GetLocationCapacityDetails(ctx, locationID, filters)
}

func toSliceOfStrings(val any) []string {
	var result []string
	switch v := val.(type) {
	case []any:
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
	case []string:
		result = v
	}
	return result
}

// GetStockBuildingBreakdown returns stock distribution per building for a single product.
func (s *statisticServiceImpl) GetStockBuildingBreakdown(ctx context.Context, productID int, startDate, endDate string) ([]analytics_dto.StockBuildingBreakdownResponse, error) {
	rows, err := s.repo.GetStockBuildingBreakdown(ctx, productID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []analytics_dto.StockBuildingBreakdownResponse{}
	}
	return rows, nil
}
