package di

import (
	system_event "github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/event"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"

	analytics_handler "github.com/dps-wmhris/backend/internal/modules/analytics/adapter/inbound/http"
	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	catalog_handler "github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	hris_handler "github.com/dps-wmhris/backend/internal/modules/hris/adapter/inbound/http"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	iam_handler "github.com/dps-wmhris/backend/internal/modules/iam/adapter/inbound/http"
	inventory_http "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	misc_handler "github.com/dps-wmhris/backend/internal/modules/misc/adapter/inbound/http"
	system_handler "github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/http"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
)

type Container struct {
	EventBus               eventbus.EventBus
	LogListener            *system_event.LogListener
	SystemLogHandler       *system_handler.SystemLogHandler
	RoleHandler            *iam_handler.RoleHandler
	UserHandler            *iam_handler.UserHandler
	AdminUserHandler       *iam_handler.AdminUserHandler
	SalesChannelHandler    *inventory_http.SalesChannelHandler
	PaperSizeHandler       *misc_handler.PaperSizeHandler
	StickerTemplateHandler *misc_handler.StickerTemplateHandler
	NotificationHandler    *system_handler.NotificationHandler
	JobHandler             *system_handler.JobHandler
	UploadHandler          *system_handler.UploadHandler
	MediaHandler           *system_handler.MediaHandler
	CategoryHandler        *catalog_handler.CategoryHandler
	ProductHandler         *catalog_handler.ProductHandler
	LocationHandler        *inventory_http.LocationHandler
	StockHandler           *inventory_http.StockHandler
	StockRequestHandler    *inventory_http.StockRequestHandler
	StockTransactionHandler *inventory_http.StockTransactionHandler
	StockQueryHandler      *inventory_http.StockQueryHandler
	PackageHandler         *catalog_handler.PackageHandler
	ReturnHandler          *inventory_http.ReturnHandler
	InvestigationHandler   *inventory_http.InvestigationHandler
	StatsHandler           *analytics_handler.StatsHandler
	ReportHandler          *analytics_handler.ReportHandler
	StatisticHandler       *analytics_handler.StatisticHandler
	ShiftHandler           *hris_handler.ShiftHandler
	FulfilmentHandler         *inventory_http.FulfilmentHandler
	ScheduleHandler        *hris_handler.ScheduleHandler
	AttendanceHandler      *hris_handler.AttendanceHandler
}

func NewContainer(systemLogHandler *system_handler.SystemLogHandler, roleHandler *iam_handler.RoleHandler, userHandler *iam_handler.UserHandler, adminUserHandler *iam_handler.AdminUserHandler, salesChannelHandler *inventory_http.SalesChannelHandler, paperSizeHandler *misc_handler.PaperSizeHandler, stickerTemplateHandler *misc_handler.StickerTemplateHandler, notificationHandler *system_handler.NotificationHandler, jobHandler *system_handler.JobHandler, uploadHandler *system_handler.UploadHandler, mediaHandler *system_handler.MediaHandler, categoryHandler *catalog_handler.CategoryHandler,
	eventBus eventbus.EventBus,
	logListener *system_event.LogListener, productHandler *catalog_handler.ProductHandler, locationHandler *inventory_http.LocationHandler, stockHandler *inventory_http.StockHandler, stockRequestHandler *inventory_http.StockRequestHandler, stockTransactionHandler *inventory_http.StockTransactionHandler, stockQueryHandler *inventory_http.StockQueryHandler, packageHandler *catalog_handler.PackageHandler, returnHandler *inventory_http.ReturnHandler, investigationHandler *inventory_http.InvestigationHandler, statsHandler *analytics_handler.StatsHandler, reportHandler *analytics_handler.ReportHandler, statisticHandler *analytics_handler.StatisticHandler, shiftHandler *hris_handler.ShiftHandler, fulfilmentHandler *inventory_http.FulfilmentHandler, scheduleHandler *hris_handler.ScheduleHandler, attendanceHandler *hris_handler.AttendanceHandler) *Container {
	return &Container{
		SystemLogHandler:       systemLogHandler,
		RoleHandler:            roleHandler,
		UserHandler:            userHandler,
		AdminUserHandler:       adminUserHandler,
		SalesChannelHandler:    salesChannelHandler,
		PaperSizeHandler:       paperSizeHandler,
		StickerTemplateHandler: stickerTemplateHandler,
		NotificationHandler:    notificationHandler,
		JobHandler:             jobHandler,
		UploadHandler:          uploadHandler,
		MediaHandler:           mediaHandler,
		CategoryHandler:        categoryHandler,
		EventBus:               eventBus,
		LogListener:            logListener,
		ProductHandler:         productHandler,
		LocationHandler:        locationHandler,
		StockHandler:           stockHandler,
		StockRequestHandler:    stockRequestHandler,
		StockTransactionHandler: stockTransactionHandler,
		StockQueryHandler:      stockQueryHandler,
		PackageHandler:         packageHandler,
		ReturnHandler:          returnHandler,
		InvestigationHandler:   investigationHandler,
		StatsHandler:           statsHandler,
		ReportHandler:          reportHandler,
		StatisticHandler:       statisticHandler,
		ShiftHandler:           shiftHandler,
		FulfilmentHandler:         fulfilmentHandler,
		ScheduleHandler:        scheduleHandler,
		AttendanceHandler:      attendanceHandler,
	}
}

type WorkerContainer struct {
	EventBus          eventbus.EventBus
	LogListener       *system_event.LogListener
	JobService        system_usecase.JobService
	StatisticService  analytics_usecase.StatisticService
	StorageService    system_usecase.StorageService
	ExportService     analytics_usecase.ExportService
	FirebaseService   system_usecase.FirebaseSignalService
	MediaService      system_usecase.MediaService
	AttendanceService hris_port.AttendanceUseCase
	ScheduleService   hris_port.ScheduleUseCase
	FulfilmentService    inventory_port.FulfilmentUseCase
	StockService      inventory_port.StockUseCase
	ProductService    catalog_port.ProductUseCase
	StockTransactionService inventory_port.StockTransactionUseCase
	KeljaClient       inventory_port.KeljaERPClient
}

func NewWorkerContainer(
	jobService system_usecase.JobService,
	statisticService analytics_usecase.StatisticService,
	storageService system_usecase.StorageService,
	exportService analytics_usecase.ExportService,
	firebaseService system_usecase.FirebaseSignalService,
	eventBus eventbus.EventBus,
	mediaService system_usecase.MediaService,
	attendanceService hris_port.AttendanceUseCase,
	scheduleService hris_port.ScheduleUseCase,
	fulfilmentService inventory_port.FulfilmentUseCase,
	stockService inventory_port.StockUseCase,
	productService catalog_port.ProductUseCase,
	stockTransactionService inventory_port.StockTransactionUseCase,
	keljaClient inventory_port.KeljaERPClient,
) *WorkerContainer {
	return &WorkerContainer{
		JobService:        jobService,
		StatisticService:  statisticService,
		StorageService:    storageService,
		ExportService:     exportService,
		FirebaseService:   firebaseService,
		EventBus:          eventBus,
		MediaService:      mediaService,
		AttendanceService: attendanceService,
		ScheduleService:   scheduleService,
		FulfilmentService:    fulfilmentService,
		StockService:      stockService,
		ProductService:    productService,
		StockTransactionService: stockTransactionService,
		KeljaClient:       keljaClient,
	}
}
