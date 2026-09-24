package inventory

import (
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/erp"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/google/wire"
)

var ProviderSet = wire.NewSet(
	http.NewSalesChannelHandler,
	usecase.NewSalesChannelService,
	erp.NewKeljaClient,
	mysql.NewSalesChannelRepository,
	mysql.NewInvestigationRepository,
	mysql.NewLocationRepository,
	mysql.NewFulfilmentRepository,
	mysql.NewReturnRepository,
	mysql.NewStockRepository,
	mysql.NewStockRequestRepository,
	mysql.NewStockTransactionRepository,
	mysql.NewStockQueryRepository,
	http.NewInvestigationHandler,
	http.NewLocationHandler,
	http.NewFulfilmentHandler,
	http.NewReturnHandler,
	http.NewStockHandler,
	http.NewStockRequestHandler,
	http.NewStockTransactionHandler,
	http.NewStockQueryHandler,
	usecase.NewInvestigationUseCase,
	usecase.NewLocationUseCase,
	usecase.NewFulfilmentUseCase,
	usecase.NewReturnUseCase,
	usecase.NewStockRequestUseCase,
	usecase.NewStockUseCase,
	usecase.NewStockTransactionService,
	usecase.NewStockQueryService,
)
