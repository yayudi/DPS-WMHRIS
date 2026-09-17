package system

import (
	"github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/event"
	"github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/http"
	"github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/google/wire"
)

var ProviderSet = wire.NewSet(
	mysql.NewJobRepository,
	mysql.NewMediaRepository,
	mysql.NewNotificationRepository,
	mysql.NewSystemLogRepository,
	mysql.NewSettingRepository,
	usecase.NewJobService,
	usecase.NewMediaService,
	usecase.NewNotificationService,
	usecase.NewSystemLogService,
	usecase.NewStorageService,
	usecase.NewFirebaseSignalService,
	http.NewJobHandler,
	http.NewMediaHandler,
	http.NewUploadHandler,
	http.NewNotificationHandler,
	http.NewSystemLogHandler,
	event.NewLogListener,
)
