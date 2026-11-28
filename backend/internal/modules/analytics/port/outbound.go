package port

import (
	"context"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
)

// ReportRepository defines outbound persistence queries for report filters, user export jobs, and stock report rows.
type ReportRepository interface {
	GetDistinctBuildings(ctx context.Context) ([]string, error)
	GetDistinctPurposes(ctx context.Context) ([]string, error)
	GetBuildingPurposeRelations(ctx context.Context) ([]map[string]any, error)
	GetUserExportJobs(ctx context.Context, userID int) ([]system_domain.ExportJob, error)
	GetStockReportData(ctx context.Context, filter analytics_dto.StockReportFilter) ([]analytics_dto.StockReportRow, error)
}

// StatisticRepository defines outbound analytical queries for stock movements, valuations, and location capacity.
type StatisticRepository interface {
	GetStockMovementStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.StockMovementSummaryResponse, error)
	GetMovementTimelineStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.StockMovementTimelineResponse, error)
	GetInventoryValueStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.InventoryValueResponse, error)
	GetShopPerformanceStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.ShopPerformanceSummary, error)
	GetDailySalesTrend(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.DailySalesTrend, error)
	GetTopSellingProducts(ctx context.Context, filters analytics_dto.StatisticFilterRequest, limit int) ([]analytics_dto.TopSellingProduct, error)
	GetFulfillmentHealth(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.FulfillmentHealth, error)
	GetPeriodComparison(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.PeriodComparison, error)
	GetPackageComponentAnalysis(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.PackageComponentDBRow, error)
	GetLocationLoads(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationLoad, error)
	GetLocationCapacityDetails(ctx context.Context, locationID int, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationCapacityDetailResponse, error)
	GetDuplicateLocations(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.DuplicateProductLocation, error)
	GetStockBuildingBreakdown(ctx context.Context, productID int, startDate, endDate string) ([]analytics_dto.StockBuildingBreakdownResponse, error)
}

// StatsRepository defines outbound data access methods for the command center dashboard KPIs.
type StatsRepository interface {
	GetOperationalPulseKpi(ctx context.Context) (analytics_dto.OperationalPulseDTO, error)
	GetInventoryValueKpi(ctx context.Context) (float64, error)
	GetSkuHealthRows(ctx context.Context) ([]analytics_dto.SkuHealthInputRow, error)
	GetDuplicateLocationWatchlist(ctx context.Context, limit int) ([]analytics_dto.DuplicateProductLocation, error)
	GetTopLoadedLocationWatchlist(ctx context.Context, limit int) ([]analytics_dto.TopLocationWatchItem, error)
	GetDailyMovementTrend(ctx context.Context, days int) ([]analytics_dto.DailyMovementPointDTO, error)
	GetBuildingDistribution(ctx context.Context) ([]analytics_dto.BuildingStockSummaryDTO, error)
}
