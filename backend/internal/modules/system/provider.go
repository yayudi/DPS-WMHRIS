// Package system wires dependency injection providers for jobs, media, notifications, audit logs, storage, and localization.
package system

import (
	"github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/event"
	"github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/google/wire"
)

// ProvideLocalizationUseCase adapts NewLocalizationService for Wire dependency injection.
func ProvideLocalizationUseCase(repo port.LocalizationRepository, txManager database.TransactionManager, bus eventbus.EventBus) port.LocalizationUseCase {
	return usecase.NewLocalizationService(repo, txManager, bus)
}

// ProviderSet supplies all repositories, use cases, HTTP handlers, and event listeners for the system module.
var ProviderSet = wire.NewSet(
	mysql.NewJobRepository,
	mysql.NewMediaRepository,
	mysql.NewNotificationRepository,
	mysql.NewSystemLogRepository,
	mysql.NewSettingRepository,
	mysql.NewLocalizationRepository,
	usecase.NewJobService,
	usecase.NewMediaService,
	usecase.NewNotificationService,
	usecase.NewSystemLogService,
	usecase.NewStorageService,
	usecase.NewFirebaseSignalService,
	ProvideLocalizationUseCase,
	http.NewJobHandler,
	http.NewMediaHandler,
	http.NewUploadHandler,
	http.NewNotificationHandler,
	http.NewSystemLogHandler,
	http.NewLocalizationHandler,
	event.NewLogListener,
)
