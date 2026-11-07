package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/modules/inventory/adapter/inbound/rabbitmq"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

func main() {
	config.LoadConfig()
	config.InitFirebase()
	if err := config.InitR2(); err != nil {
		log.Printf("Failed to initialize R2: %v", err)
	}

	db := database.ConnectDB()
	defer db.Close()

	jobRepo := system_mysql.NewJobRepository(db)
	container, err := InitializeWorker(db)
	if err != nil {
		log.Fatalf("Failed to subscribe to SalesOrderCreated: %v", err)
	}

	eventBus := container.EventBus
	
	// Register StockConsumer
	inventoryRabbitMQ := rabbitmq.NewStockConsumer(container.StockService, db)
	if err := inventoryRabbitMQ.RegisterHandlers(eventBus); err != nil {
		log.Printf("Failed to register StockConsumer handlers: %v", err)
	}

	// Register LogListener
	if container.LogListener != nil {
		if err := container.LogListener.Register(eventBus); err != nil {
			log.Printf("Failed to register LogListener handlers: %v", err)
		}
	}



	jobService := container.JobService
	_ = container.StatisticService
	_ = container.StorageService
	exportService := container.ExportService
	attendanceService := container.AttendanceService
	stockService := container.StockService
	firebaseService := container.FirebaseService
	scheduleService := container.ScheduleService
	productService := container.ProductService
	mediaService := container.MediaService

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	stockTransactionService := container.StockTransactionService

	go func() {
		<-sigChan
		log.Println("Shutting down worker...")
		cancel()
	}()
	go func() {
		log.Println("Starting EventBus...")
		if err := eventBus.Start(ctx); err != nil {
			log.Printf("EventBus failed to start: %v", err)
		}
	}()
	go func() {
		log.Println("Starting Outbox Event Dispatcher...")
		outboxTicker := time.NewTicker(2 * time.Second)
		defer outboxTicker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-outboxTicker.C:
				if count, err := stockTransactionService.DispatchPendingOutboxEvents(ctx); err != nil {
					log.Printf("[Outbox] Dispatch error: %v", err)
				} else if count > 0 {
					log.Printf("[Outbox] Dispatched %d events", count)
				}
			}
		}
	}()
	go func() {
		log.Println("Starting Kelja Fulfillment Reconciler (Safety Net)...")
		reconcileTicker := time.NewTicker(15 * time.Minute)
		defer reconcileTicker.Stop()

		// Initial check after startup warmup
		select {
		case <-ctx.Done():
			return
		case <-time.After(10 * time.Second):
			if count, err := stockTransactionService.ReconcileMissingFulfillments(ctx); err != nil {
				log.Printf("[Reconciliation] Startup check error: %v", err)
			} else if count > 0 {
				log.Printf("[Reconciliation] Startup check reconciled %d missing fulfillments", count)
			}
		}

		for {
			select {
			case <-ctx.Done():
				return
			case <-reconcileTicker.C:
				if count, err := stockTransactionService.ReconcileMissingFulfillments(ctx); err != nil {
					log.Printf("[Reconciliation] Periodic check error: %v", err)
				} else if count > 0 {
					log.Printf("[Reconciliation] Periodic check reconciled %d missing fulfillments", count)
				}
			}
		}
	}()

	log.Println("Worker started. Polling for jobs...")



	pollInterval := 5 * time.Second
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Worker stopped.")
			return
		case <-ticker.C:
			if recovered, err := jobRepo.RecoverStuckImportJobs(ctx); err == nil && recovered > 0 {
				log.Printf("Recovered %d stuck import jobs", recovered)
			}
			if recovered, err := jobRepo.RecoverStuckExportJobs(ctx); err == nil && recovered > 0 {
				log.Printf("Recovered %d stuck export jobs", recovered)
			}
			processPendingImportJobs(ctx, container.TxManager, jobRepo, jobService, attendanceService, stockService, scheduleService, productService, firebaseService, mediaService)
			processPendingExportJobs(ctx, container.TxManager, jobRepo, jobService, exportService, firebaseService)
		}
	}
}

const maxConcurrentJobs = 3

func processPendingImportJobs(
	ctx context.Context,
	txManager database.TransactionManager,
	jobRepo system_mysql.JobRepository,
	jobService system_usecase.JobService,
	attendanceService hris_port.AttendanceUseCase,
	stockService inventory_port.StockUseCase,
	scheduleService hris_port.ScheduleUseCase,
	productService catalog_port.ProductUseCase,
	firebaseService system_usecase.FirebaseSignalService,
	mediaService system_usecase.MediaService,
) {
	dispatchJobs(
		ctx,
		txManager,
		dispatchConfig{Concurrency: maxConcurrentJobs, JobTimeout: 10 * time.Minute, Name: "import"},
		jobRepo.ClaimNextImportJob,
		func(ctx context.Context, job *system_domain.ImportJob) error {
			filePath := utils.ResolveStoragePath(job.FilePath)
			log.Printf("Found PENDING import job: %d (%s), file: %s (resolved: %s)", job.ID, job.JobType, job.FilePath, filePath)

			// Execute Job
			var processErr error
			var logSummary string
			func() {
				defer func() {
					if r := recover(); r != nil {
						processErr = fmt.Errorf("internal worker panic: %v", r)
					}
				}()

				switch job.JobType {
				case "IMPORT_ATTENDANCE":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = attendanceService.ProcessImport(ctx, job.ID, filePath, false)
				case "IMPORT_ATTENDANCE_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = attendanceService.ProcessImport(ctx, job.ID, filePath, true)
				case "IMPORT_SCHEDULES":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = scheduleService.ProcessImport(ctx, job.ID, filePath, job.UserID)
				case "BATCH_EDIT_PRODUCT":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchUpdate(ctx, job.ID, filePath, job.UserID, false)
				case "BATCH_EDIT_PRODUCT_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchUpdate(ctx, job.ID, filePath, job.UserID, true)
				case "IMPORT_PACKAGES":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchPackageUpdate(ctx, job.ID, filePath, job.UserID, false)
				case "IMPORT_PACKAGES_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchPackageUpdate(ctx, job.ID, filePath, job.UserID, true)
				case "IMPORT_MEDIA_BULK_LINK":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = mediaService.ProcessMediaLinkImport(ctx, filePath, job.UserID)
				case "ADJUST_STOCK":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessStockImport(ctx, job.ID, filePath, job.UserID, false)
				case "ADJUST_STOCK_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessStockImport(ctx, job.ID, filePath, job.UserID, true)
				case "IMPORT_STOCK_INBOUND":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessImportBatchInbound(ctx, job.ID, filePath, job.UserID, false)
				case "IMPORT_STOCK_INBOUND_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessImportBatchInbound(ctx, job.ID, filePath, job.UserID, true)

				default:
					log.Printf("Unknown job type: %s", job.JobType)
					processErr = fmt.Errorf("unknown job type: %s", job.JobType)
				}
			}()

			// Update job status
			if processErr != nil {
				log.Printf("Job %d failed: %v", job.ID, processErr)
				errSummary := processErr.Error()
				if logSummary != "" {
					errSummary = fmt.Sprintf("%s | %s", logSummary, errSummary)
				}
				if job.JobType != "SYNC_API_KELJA" {
					if errLog := jobService.UpdateImportJobStatusWithSummary(ctx, job.ID, "FAILED", errSummary); errLog != nil {
						log.Printf("Failed to update job status: %v", errLog)
					}
				}
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "IMPORT_FAILED")
			} else {
				if logSummary == "" {
					logSummary = fmt.Sprintf("Job %s selesai diproses.", job.JobType)
				}
				log.Printf("Job %d completed with summary: %s", job.ID, logSummary)
				if job.JobType != "SYNC_API_KELJA" {
					if errLog := jobService.UpdateImportJobStatusWithSummary(ctx, job.ID, "COMPLETED", logSummary); errLog != nil {
						log.Printf("Failed to update job status: %v", errLog)
					}
				}
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "IMPORT_COMPLETED")
				if job.JobType == "IMPORT_ATTENDANCE" {
					_ = firebaseService.EmitSharedTaskSignal(ctx, "HRIS_ATTENDANCE", "REFRESH_ATTENDANCE")
				}
			}
			return processErr
		},
	)
}

func processPendingExportJobs(
	ctx context.Context,
	txManager database.TransactionManager,
	jobRepo system_mysql.JobRepository,
	jobService system_usecase.JobService,
	exportService analytics_usecase.ExportService,
	firebaseService system_usecase.FirebaseSignalService,
) {
	dispatchJobs(
		ctx,
		txManager,
		dispatchConfig{Concurrency: maxConcurrentJobs, JobTimeout: 10 * time.Minute, Name: "export"},
		jobRepo.ClaimNextExportJob,
		func(ctx context.Context, job *system_domain.ExportJob) error {
			log.Printf("Found PENDING export job: %d (%s)", job.ID, job.JobType)

			var processErr error
			filtersJSON := ""
			if job.Filters != nil {
				filtersJSON = *job.Filters
			}

			cleanJobType := strings.TrimSpace(job.JobType)
			func() {
				defer func() {
					if r := recover(); r != nil {
						processErr = fmt.Errorf("internal export worker panic: %v", r)
					}
				}()

				switch cleanJobType {
				case "STATISTICS_STOCK_MOVEMENT":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportStockMovement(ctx, job.ID, filtersJSON)
				case "STATISTICS_STOCK_TIMELINE":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportStockTimeline(ctx, job.ID, filtersJSON)
				case "STOCK_REPORT":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportStockReport(ctx, job.ID, filtersJSON)
				case "BATCH_LOG_EXPORT":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportBatchLog(ctx, job.ID, filtersJSON)
				case "STATISTICS_LOCATION_CAPACITY":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportLocationCapacity(ctx, job.ID, filtersJSON)
				case "PRODUCT_MASTER":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportProduct(ctx, job.ID, filtersJSON)
				case "EXPORT_PACKAGES":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportPackage(ctx, job.ID, filtersJSON)
				default:
					log.Printf("Unknown export job type: %s (hex: %x)", job.JobType, job.JobType)
					processErr = fmt.Errorf("unknown export job type: %s", job.JobType)
				}
			}()

			if processErr != nil {
				log.Printf("Export Job %d failed: %v", job.ID, processErr)
				errMsg := processErr.Error()
				if errLog := jobService.UpdateExportJobStatus(ctx, job.ID, "FAILED", nil, &errMsg); errLog != nil {
					log.Printf("Failed to update job status: %v", errLog)
				}
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "EXPORT_FAILED")
			} else {
				log.Printf("Export Job %d completed successfully", job.ID)
				// Job status is updated by the service (ProcessExportStockReport etc)
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "EXPORT_COMPLETED")
			}
			return processErr
		},
	)
}
