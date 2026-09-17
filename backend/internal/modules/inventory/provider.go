package inventory

import (
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/google/wire"
)

var ProviderSet = wire.NewSet(
	http.NewSalesChannelHandler,
	usecase.NewSalesChannelService,
	mysql.NewSalesChannelRepository,
	mysql.NewInvestigationRepository,
	mysql.NewLocationRepository,
	mysql.NewPickingRepository,
	mysql.NewReturnRepository,
	mysql.NewStockRepository,
	mysql.NewStockRequestRepository,
	http.NewInvestigationHandler,
	http.NewLocationHandler,
	http.NewPickingHandler,
	http.NewReturnHandler,
	http.NewStockHandler,
	http.NewStockRequestHandler,
	usecase.NewInvestigationUseCase,
	usecase.NewLocationUseCase,
	usecase.NewPickingUseCase,
	usecase.NewReturnUseCase,
	usecase.NewStockRequestUseCase,
	usecase.NewStockUseCase,
)
