// Package inventory wires dependency injection providers for locations, slotting, stock requests, stock mutations, fulfillment, returns, investigations, and sales channels.
package inventory

import (
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/rabbitmq"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/erp"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/inventory/application/usecase"
	"github.com/google/wire"
)

// ProviderSet wires all inventory repositories, use cases, HTTP handlers, ERP clients, and RabbitMQ consumers.
var ProviderSet = wire.NewSet(
	http.NewSalesChannelHandler,
	usecase.NewSalesChannelService,
	mysql.NewSalesChannelRepository,
	mysql.NewInvestigationRepository,
	mysql.NewLocationRepository,
	mysql.NewReturnRepository,
	mysql.NewStockRepository,
	mysql.NewStockRequestRepository,
	mysql.NewStockTransactionRepository,
	mysql.NewOutboxRepository,
	erp.NewKeljaClient,
	mysql.NewStockQueryRepository,
	mysql.NewSlotRepository,
	http.NewInvestigationHandler,
	http.NewLocationHandler,
	http.NewReturnHandler,
	http.NewStockHandler,
	http.NewStockRequestHandler,
	http.NewStockTransactionHandler,
	http.NewStockQueryHandler,
	http.NewSlotHandler,
	rabbitmq.NewStockConsumer,
	usecase.NewInvestigationUseCase,
	usecase.NewLocationUseCase,
	usecase.NewReturnUseCase,
	usecase.NewStockRequestUseCase,
	usecase.NewStockUseCase,
	usecase.NewStockTransactionService,
	usecase.NewStockQueryService,
	usecase.NewSlotUseCase,
)
