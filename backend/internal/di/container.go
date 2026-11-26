// Package di wires application dependencies for the HTTP API server and CLI worker via google/wire.
package di

import (
	analytics_handler "github.com/dps-wmhris/backend/internal/modules/analytics/adapter/inbound/http"
	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	catalog_handler "github.com/dps-wmhris/backend/internal/modules/catalog/adapter/inbound/http"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	hris_handler "github.com/dps-wmhris/backend/internal/modules/hris/adapter/inbound/http"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	iam_handler "github.com/dps-wmhris/backend/internal/modules/iam/adapter/inbound/http"
	inventory_http "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/http"
	inventory_rabbitmq "github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/rabbitmq"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	misc_handler "github.com/dps-wmhris/backend/internal/modules/misc/adapter/inbound/http"
	system_event "github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/event"
	system_handler "github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/http"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

// Container aggregates all HTTP handlers and shared runtime dependencies required by cmd/api.
type Container struct {
	EventBus                eventbus.EventBus
	SystemLogHandler        *system_handler.SystemLogHandler
	RoleHandler             *iam_handler.RoleHandler
	UserHandler             *iam_handler.UserHandler
	AdminUserHandler        *iam_handler.AdminUserHandler
	SalesChannelHandler     *inventory_http.SalesChannelHandler
	PaperSizeHandler        *misc_handler.PaperSizeHandler
	StickerTemplateHandler  *misc_handler.StickerTemplateHandler
	NotificationHandler     *system_handler.NotificationHandler
	JobHandler              *system_handler.JobHandler
	UploadHandler           *system_handler.UploadHandler
	MediaHandler            *system_handler.MediaHandler
	LocalizationHandler     *system_handler.LocalizationHandler
	CategoryHandler         *catalog_handler.CategoryHandler
	ProductHandler          *catalog_handler.ProductHandler
	LocationHandler         *inventory_http.LocationHandler
	StockHandler            *inventory_http.StockHandler
	StockRequestHandler     *inventory_http.StockRequestHandler
	StockTransactionHandler *inventory_http.StockTransactionHandler
	StockQueryHandler       *inventory_http.StockQueryHandler
	SlotHandler             *inventory_http.SlotHandler
	PackageHandler          *catalog_handler.PackageHandler
	ReturnHandler           *inventory_http.ReturnHandler
	InvestigationHandler    *inventory_http.InvestigationHandler
	StatsHandler            *analytics_handler.StatsHandler
	ReportHandler           *analytics_handler.ReportHandler
	StatisticHandler        *analytics_handler.StatisticHandler
	ShiftHandler            *hris_handler.ShiftHandler
	ScheduleHandler         *hris_handler.ScheduleHandler
	AttendanceHandler       *hris_handler.AttendanceHandler
}

// WorkerContainer aggregates all background services, consumers, and infrastructure required by cmd/worker.
type WorkerContainer struct {
	TxManager               database.TransactionManager
	EventBus                eventbus.EventBus
	LogListener             *system_event.LogListener
	StockConsumer           *inventory_rabbitmq.StockConsumer
	JobRepo                 system_mysql.JobRepository
	JobService              system_usecase.JobService
	ExportService           analytics_usecase.ExportService
	FirebaseService         system_usecase.FirebaseSignalService
	MediaService            system_usecase.MediaService
	AttendanceService       hris_port.AttendanceUseCase
	ScheduleService         hris_port.ScheduleUseCase
	StockService            inventory_port.StockUseCase
	ProductService          catalog_port.ProductUseCase
	StockTransactionService inventory_port.StockTransactionUseCase
}
