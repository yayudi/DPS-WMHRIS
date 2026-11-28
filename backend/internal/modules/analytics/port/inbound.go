// Package port defines hexagonal inbound and outbound port interfaces for the analytics bounded context.
package port

import (
	"context"

	analytics_dto "github.com/dps-wmhris/backend/internal/modules/analytics/application/dto"
)

// ReportService defines inbound operations for report filter metadata and user export job history.
type ReportService interface {
	GetReportFilters(ctx context.Context) (analytics_dto.ReportFilterResponse, error)
	GetUserExportJobs(ctx context.Context, userID int) ([]analytics_dto.UserExportJobResponse, error)
}

// StatisticService defines inbound operations for warehouse analytics statistics and async export requests.
type StatisticService interface {
	GetStockMovementStatistics(ctx context.Context, filters analytics_dto.StatisticFilterRequest) (*analytics_dto.StockMovementResponse, error)
	RequestStockMovementsExport(ctx context.Context, userID int, req analytics_dto.ExportStatisticRequest) (int, error)
	GetStockTimelineStatistics(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.StockTimelineResponse, error)
	RequestStockTimelineExport(ctx context.Context, userID int, req analytics_dto.ExportTimelineRequest) (int, error)
	GetInventoryValueStatistics(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.InventoryValueResponse, error)
	GetShopPerformanceStats(ctx context.Context, filters analytics_dto.StatisticFilterRequest) (*analytics_dto.ShopPerformanceResponse, error)
	GetPackageComponentAnalysis(ctx context.Context, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.PackageComponentAnalysisResponse, error)
	GetLocationAnalysis(ctx context.Context, filters analytics_dto.StatisticFilterRequest) (*analytics_dto.LocationAnalysisResponse, error)
	GetLocationCapacityDetails(ctx context.Context, locationID int, filters analytics_dto.StatisticFilterRequest) ([]analytics_dto.LocationCapacityDetailResponse, error)
	RequestLocationCapacityExport(ctx context.Context, userID int, req analytics_dto.ExportLocationCapacityRequest) (int, error)
	GetStockBuildingBreakdown(ctx context.Context, productID int, startDate, endDate string) ([]analytics_dto.StockBuildingBreakdownResponse, error)
}

// StatsService defines inbound operations for the analytics command center KPI dashboard.
type StatsService interface {
	GetKpiSummary(ctx context.Context) (analytics_dto.KpiSummaryResponse, error)
}

// ExportService defines background worker export job processors for Excel report generation.
type ExportService interface {
	ProcessExportStockMovement(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportStockTimeline(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportBatchLog(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportStockReport(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportLocationCapacity(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportProduct(ctx context.Context, jobID int, filtersJSON string) error
	ProcessExportPackage(ctx context.Context, jobID int, filtersJSON string) error
}
