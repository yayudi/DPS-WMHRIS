// Package analytics wires dependency injection providers for reporting, statistics, KPI stats, and background exports.
package analytics

import (
	"github.com/dps-wmhris/backend/internal/modules/analytics/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/analytics/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	"github.com/google/wire"
)

// ProviderSet wires all analytics repositories, use cases, export processors, and HTTP handlers.
var ProviderSet = wire.NewSet(
	mysql.NewReportRepository,
	mysql.NewStatisticRepository,
	mysql.NewStatsRepository,
	usecase.NewReportService,
	usecase.NewStatisticService,
	usecase.NewStatsService,
	usecase.NewExportService,
	http.NewReportHandler,
	http.NewStatisticHandler,
	http.NewStatsHandler,
)
