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

// GlobalProviderSet combines all bounded-context module providers and shared infrastructure providers.
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

// ContainerProviderSet wires the root API and Worker dependency containers via google/wire struct injection.
var ContainerProviderSet = wire.NewSet(
	wire.Struct(new(Container), "*"),
	wire.Struct(new(WorkerContainer), "*"),
)

// ProvideEventBus wires the RabbitMQ EventBus singleton using the configured queue name.
func ProvideEventBus() (eventbus.EventBus, error) {
	queueName := config.AppConfig.RabbitMQQueueName
	if queueName == "" {
		queueName = "queue.wmhris.core"
	}
	return eventbus.NewRabbitMQEventBus(config.AppConfig.RabbitMQURL, queueName)
}

// EventBusProviderSet provides the application EventBus implementation.
var EventBusProviderSet = wire.NewSet(ProvideEventBus)
