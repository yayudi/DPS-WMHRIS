package di

import (
	"github.com/dps-wmhris/backend/internal/modules/analytics"
	"github.com/dps-wmhris/backend/internal/modules/catalog"
	"github.com/dps-wmhris/backend/internal/modules/hris"
	"github.com/dps-wmhris/backend/internal/modules/iam"
	"github.com/dps-wmhris/backend/internal/modules/inventory"
	"github.com/dps-wmhris/backend/internal/modules/misc"
	"github.com/dps-wmhris/backend/internal/modules/system"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/google/wire"
)

var GlobalProviderSet = wire.NewSet(
	iam.ProviderSet,
	hris.ProviderSet,
	catalog.ProviderSet,
	inventory.ProviderSet,
	analytics.ProviderSet,
	misc.ProviderSet,
	system.ProviderSet,
	EventBusProviderSet,
	database.NewTransactionManager,
)

var ContainerProviderSet = wire.NewSet(NewContainer, NewWorkerContainer)

// ProvideEventBus wires the EventBus singleton
func ProvideEventBus() (eventbus.EventBus, error) {
	// We use the application name or group name as the queue name
	return eventbus.NewRabbitMQEventBus(config.AppConfig.RabbitMQURL, "queue.wmhris.core")
}

var EventBusProviderSet = wire.NewSet(ProvideEventBus)
