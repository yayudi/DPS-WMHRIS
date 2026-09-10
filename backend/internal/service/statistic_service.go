package service

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/dto"
	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/repository"
)

type StatisticService interface {
	GetStockMovementStatistics(ctx context.Context, filters dto.StatisticFilterRequest) (*dto.StockMovementResponse, error)
	RequestStockMovementsExport(ctx context.Context, userID int, req dto.ExportStatisticRequest) (int, error)
	GetStockTimelineStatistics(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.StockTimelineResponse, error)
	RequestStockTimelineExport(ctx context.Context, userID int, req dto.ExportTimelineRequest) (int, error)
	GetInventoryValueStatistics(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.InventoryValueResponse, error)
	GetShopPerformanceStats(ctx context.Context, filters dto.StatisticFilterRequest) (*dto.ShopPerformanceResponse, error)
	GetPackageComponentAnalysis(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.PackageComponentAnalysisResponse, error)
	GetLocationAnalysis(ctx context.Context, filters dto.StatisticFilterRequest) (*dto.LocationAnalysisResponse, error)
	GetLocationCapacityDetails(ctx context.Context, locationId int, filters dto.StatisticFilterRequest) ([]dto.LocationCapacityDetailResponse, error)
	RequestLocationCapacityExport(ctx context.Context, userID int, req dto.ExportLocationCapacityRequest) (int, error)
}

type statisticServiceImpl struct {
	repo    repository.StatisticRepository
	jobRepo repository.JobRepository
}

func NewStatisticService(repo repository.StatisticRepository, jobRepo repository.JobRepository) StatisticService {
	return &statisticServiceImpl{
		repo:    repo,
		jobRepo: jobRepo,
	}
}

func parseDate(dateStr string) time.Time {
	t, _ := time.Parse("2006-01-02", dateStr)
	return t
}

func (s *statisticServiceImpl) GetStockMovementStatistics(ctx context.Context, filters dto.StatisticFilterRequest) (*dto.StockMovementResponse, error) {
	var summaryRows []dto.StockMovementSummaryResponse
	var timelineRows []dto.StockMovementTimelineResponse
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
	if days == 0 {
		days = 1
	}

	var formattedSummary []dto.StockMovementSummaryResponse
	for _, row := range summaryRows {
		avgDailySales := row.TotalSold / days
		currentStock := row.CurrentStock
		var daysOfInventory *float64
		if avgDailySales > 0 {
			val := currentStock / avgDailySales
			// round to 1 decimal
			val = math.Round(val*10) / 10
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
		} else if *daysOfInventory == -1 && currentStock > 0 && currentStock >= 100 {
			status = "OVERSTOCK"
		}

		row.AvgDailySales = math.Round(avgDailySales*100) / 100
		row.DaysOfInventory = daysOfInventory
		row.Status = status

		formattedSummary = append(formattedSummary, row)
	}

	// Filter logic post-process (mimic Node behavior if complex status filtering was requested)
	if filters.Status != "" && filters.Status != "all" {
		var inc, exc []string
		v := filters.Status
		var parsed map[string]interface{}
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
			var filtered []dto.StockMovementSummaryResponse
			for _, item := range formattedSummary {
				includeIt := true
				if len(inc) > 0 {
					includeIt = false
					for _, s := range inc {
						if item.Status == strings.ToUpper(s) {
							includeIt = true
							break
						}
					}
				}
				if len(exc) > 0 {
					for _, s := range exc {
						if item.Status == strings.ToUpper(s) {
							includeIt = false
							break
						}
					}
				}
				if includeIt {
					filtered = append(filtered, item)
				}
			}
			formattedSummary = filtered
		}
	}

	if filters.Movement != "" && filters.Movement != "all" {
		var filtered []dto.StockMovementSummaryResponse
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

	if formattedSummary == nil {
		formattedSummary = []dto.StockMovementSummaryResponse{}
	}
	if timelineRows == nil {
		timelineRows = []dto.StockMovementTimelineResponse{}
	}

	return &dto.StockMovementResponse{
		Summary:  formattedSummary,
		Timeline: timelineRows,
	}, nil
}

func (s *statisticServiceImpl) RequestStockMovementsExport(ctx context.Context, userID int, req dto.ExportStatisticRequest) (int, error) {
	filtersJSON, _ := json.Marshal(map[string]interface{}{
		"startDate":   req.StartDate,
		"endDate":     req.EndDate,
		"searchQuery": req.SearchQuery,
		"status":      req.Status,
		"movement":    req.Movement,
		"buildings":   req.Building,
		"categoryId":  req.CategoryId,
		"exportType":  "STATISTICS_STOCK_MOVEMENT",
		"exportName":  req.ExportName,
	})
	fString := string(filtersJSON)

	job := &model.ExportJob{
		UserID:  userID,
		JobType: "STATISTICS_STOCK_MOVEMENT",
		Filters: &fString,
	}

	return s.jobRepo.CreateExportJob(ctx, job)
}

func (s *statisticServiceImpl) GetStockTimelineStatistics(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.StockTimelineResponse, error) {
	rows, err := s.repo.GetMovementTimelineStats(ctx, filters)
	if err != nil {
		return nil, err
	}

	var data []dto.StockTimelineResponse
	for _, r := range rows {
		data = append(data, dto.StockTimelineResponse{
			Date:      r.Date,
			TotalIn:   r.TotalIn,
			TotalOut:  r.TotalOut,
			NetChange: r.TotalIn - r.TotalOut,
		})
	}
	if data == nil {
		data = []dto.StockTimelineResponse{}
	}
	return data, nil
}

func (s *statisticServiceImpl) RequestStockTimelineExport(ctx context.Context, userID int, req dto.ExportTimelineRequest) (int, error) {
	status := "all"
	if req.Status != nil {
		statusStr, ok := req.Status.(string)
		if ok {
			status = statusStr
		}
	}
	movement := "all"
	if req.Movement != "" {
		movement = req.Movement
	}

	filtersJSON, _ := json.Marshal(map[string]interface{}{
		"searchQuery": req.SearchQuery,
		"status":      status,
		"movement":    movement,
		"buildings":   req.Building,
		"exportType":  "STATISTICS_STOCK_TIMELINE",
		"exportName":  req.ExportName,
	})
	fString := string(filtersJSON)

	job := &model.ExportJob{
		UserID:  userID,
		JobType: "STATISTICS_STOCK_TIMELINE",
		Filters: &fString,
	}

	return s.jobRepo.CreateExportJob(ctx, job)
}

func (s *statisticServiceImpl) GetInventoryValueStatistics(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.InventoryValueResponse, error) {
	rows, err := s.repo.GetInventoryValueStats(ctx, filters)
	if err != nil {
		return nil, err
	}

	var globalTotalValue float64
	for _, row := range rows {
		globalTotalValue += row.TotalValue
	}

	var data []dto.InventoryValueResponse
	for _, row := range rows {
		var percentage float64
		if globalTotalValue > 0 {
			percentage = (row.TotalValue / globalTotalValue) * 100
		}
		row.Percentage = math.Round(percentage*100) / 100

		status := "SAFE"
		if row.TotalQuantity == 0 {
			status = "EMPTY"
		} else if row.TotalQuantity < 0 {
			status = "NEGATIVE"
		} else if row.TotalQuantity > 100 {
			status = "OVERSTOCK"
		} else if row.TotalQuantity > 50 && row.TotalQuantity < 100 {
			status = "WARNING"
		} else if row.TotalQuantity > 0 && row.TotalQuantity < 50 {
			status = "CRITICAL"
		}
		row.Status = status

		data = append(data, row)
	}

	if data == nil {
		data = []dto.InventoryValueResponse{}
	}
	return data, nil
}

func (s *statisticServiceImpl) GetShopPerformanceStats(ctx context.Context, filters dto.StatisticFilterRequest) (*dto.ShopPerformanceResponse, error) {
	var summary []dto.ShopPerformanceSummary
	var trend []dto.DailySalesTrend
	var topProducts []dto.TopSellingProduct
	var health []dto.FulfillmentHealth
	var comp []dto.PeriodComparison

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

	resp := &dto.ShopPerformanceResponse{
		Summary:     summary,
		DailyTrend:  trend,
		TopProducts: topProducts,
		Fulfillment: health,
	}

	if resp.Summary == nil {
		resp.Summary = []dto.ShopPerformanceSummary{}
	}
	if resp.DailyTrend == nil {
		resp.DailyTrend = []dto.DailySalesTrend{}
	}
	if resp.TopProducts == nil {
		resp.TopProducts = []dto.TopSellingProduct{}
	}
	if resp.Fulfillment == nil {
		resp.Fulfillment = []dto.FulfillmentHealth{}
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

func (s *statisticServiceImpl) GetPackageComponentAnalysis(ctx context.Context, filters dto.StatisticFilterRequest) ([]dto.PackageComponentAnalysisResponse, error) {
	rows, err := s.repo.GetPackageComponentAnalysis(ctx, filters)
	if err != nil {
		return nil, err
	}

	var pInclude, pExclude []int
	if filters.PackageCategoryId != "" {
		vStr := filters.PackageCategoryId
		var parsed map[string][]int
		if err := json.Unmarshal([]byte(vStr), &parsed); err == nil {
			pInclude = parsed["include"]
			pExclude = parsed["exclude"]
		}
	}

	compMap := make(map[int]*dto.PackageComponentAnalysisResponse)

	for _, row := range rows {
		cmpID := row.ComponentProductID
		if _, exists := compMap[cmpID]; !exists {
			compMap[cmpID] = &dto.PackageComponentAnalysisResponse{
				ComponentProductID: cmpID,
				SKU:                row.ComponentSKU,
				Name:               row.ComponentName,
				CategoryID:         row.ComponentCategoryID,
				CurrentStock:       row.CurrentStock,
				TotalNeeded:        0,
				Packages:           []dto.PackageComponentPackageInfo{},
			}
		}

		comp := compMap[cmpID]
		pid := row.PackageCategoryID

		includePackage := true
		if len(pInclude) > 0 {
			includePackage = false
			if pid != nil {
				for _, id := range pInclude {
					if id == *pid {
						includePackage = true
						break
					}
				}
			}
		}
		if len(pExclude) > 0 && pid != nil {
			for _, id := range pExclude {
				if id == *pid {
					includePackage = false
					break
				}
			}
		}

		if includePackage {
			comp.Packages = append(comp.Packages, dto.PackageComponentPackageInfo{
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

	var sInclude, sExclude []string
	if filters.StockStatus != "" {
		vStr := filters.StockStatus
		var parsed map[string][]string
		if err := json.Unmarshal([]byte(vStr), &parsed); err == nil {
			sInclude = parsed["include"]
			sExclude = parsed["exclude"]
		}
	}

	var data []dto.PackageComponentAnalysisResponse
	for _, comp := range compMap {
		deficit := comp.TotalNeeded - comp.CurrentStock
		comp.Deficit = deficit

		status := "SAFE"
		if deficit > 0 {
			status = "DEFICIT"
		} else if comp.CurrentStock == 0 && comp.TotalNeeded > 0 {
			status = "DEFICIT"
		} else if deficit <= 0 && deficit >= -20 {
			status = "WARNING"
		}
		comp.Status = status

		if comp.TotalNeeded == 0 {
			continue
		}

		includeComp := true
		if len(sInclude) > 0 {
			includeComp = false
			for _, s := range sInclude {
				if s == comp.Status {
					includeComp = true
					break
				}
			}
		}
		if len(sExclude) > 0 {
			for _, s := range sExclude {
				if s == comp.Status {
					includeComp = false
					break
				}
			}
		}

		if includeComp {
			data = append(data, *comp)
		}
	}

	// sort by total_needed desc manually
	for i := 0; i < len(data)-1; i++ {
		for j := i + 1; j < len(data); j++ {
			if data[j].TotalNeeded > data[i].TotalNeeded {
				data[i], data[j] = data[j], data[i]
			}
		}
	}

	if data == nil {
		data = []dto.PackageComponentAnalysisResponse{}
	}

	return data, nil
}

func (s *statisticServiceImpl) RequestLocationCapacityExport(ctx context.Context, userID int, req dto.ExportLocationCapacityRequest) (int, error) {
	filtersJSON, _ := json.Marshal(map[string]interface{}{
		"searchQuery":  req.SearchQuery,
		"categoryId":   req.CategoryId,
		"purpose":      req.Purpose,
		"building":     req.Building,
		"floor":        req.Floor,
		"exportType":   "STATISTICS_LOCATION_CAPACITY",
		"exportName":   req.ExportName,
		"exportFormat": req.ExportFormat,
	})
	fString := string(filtersJSON)

	job := &model.ExportJob{
		UserID:  userID,
		JobType: "STATISTICS_LOCATION_CAPACITY",
		Filters: &fString,
	}

	return s.jobRepo.CreateExportJob(ctx, job)
}


func (s *statisticServiceImpl) GetLocationAnalysis(ctx context.Context, filters dto.StatisticFilterRequest) (*dto.LocationAnalysisResponse, error) {
	var loads []dto.LocationLoad
	var dups []dto.DuplicateProductLocation
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
		loads = []dto.LocationLoad{}
	}
	if dups == nil {
		dups = []dto.DuplicateProductLocation{}
	}

	return &dto.LocationAnalysisResponse{
		LocationLoads:     loads,
		DuplicateProducts: dups,
	}, nil
}

func (s *statisticServiceImpl) GetLocationCapacityDetails(ctx context.Context, locationId int, filters dto.StatisticFilterRequest) ([]dto.LocationCapacityDetailResponse, error) {
	return s.repo.GetLocationCapacityDetails(ctx, locationId, filters)
}

func toSliceOfStrings(val interface{}) []string {
	var result []string
	switch v := val.(type) {
	case []interface{}:
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
