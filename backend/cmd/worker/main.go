package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/signal"
	"runtime/debug"
	"strings"
	"sync"
	"syscall"
	"time"

	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
	"github.com/dps-wmhris/backend/internal/shared/utils"
)

const (
	maxConcurrentJobs      = 3
	pollInterval           = 5 * time.Second
	outboxPollInterval     = 2 * time.Second
	outboxTickTimeout      = 15 * time.Second
	reconcileInterval      = 15 * time.Minute
	reconcileWarmupDelay   = 10 * time.Second
	reconcileTickTimeout   = 2 * time.Minute
	jobExecutionTimeout    = 10 * time.Minute
	jobStatusUpdateTimeout = 10 * time.Second
)

func main() {
	config.LoadConfig()
	config.InitFirebase()
	if err := config.InitR2(); err != nil {
		log.Printf("Failed to initialize R2: %v", err)
	}

	db := database.ConnectDB()
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("Error closing database connection: %v", err)
		}
	}()

	container, err := InitializeWorker(db)
	if err != nil {
		log.Fatalf("Failed to initialize worker: %v", err)
	}
	defer func() {
		if container.EventBus != nil {
			if err := container.EventBus.Close(); err != nil {
				log.Printf("Error closing EventBus connection: %v", err)
			}
		}
	}()

	eventBus := container.EventBus

	// Register StockConsumer
	if container.StockConsumer != nil {
		if err := container.StockConsumer.RegisterHandlers(eventBus); err != nil {
			log.Printf("Failed to register StockConsumer handlers: %v", err)
		}
	}

	// Register LogListener
	if container.LogListener != nil {
		if err := container.LogListener.Register(eventBus); err != nil {
			log.Printf("Failed to register LogListener handlers: %v", err)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	jobRepo := container.JobRepo
	jobService := container.JobService
	exportService := container.ExportService
	attendanceService := container.AttendanceService
	stockService := container.StockService
	firebaseService := container.FirebaseService
	scheduleService := container.ScheduleService
	productService := container.ProductService
	mediaService := container.MediaService
	stockTransactionService := container.StockTransactionService

	var bgWg sync.WaitGroup

	bgWg.Add(1)
	go func() {
		defer bgWg.Done()
		log.Println("Starting EventBus...")
		if err := eventBus.Start(ctx); err != nil && ctx.Err() == nil {
			log.Printf("EventBus failed to start: %v", err)
		}
	}()

	bgWg.Add(1)
	go func() {
		defer bgWg.Done()
		log.Println("Starting Outbox Event Dispatcher...")
		outboxTicker := time.NewTicker(outboxPollInterval)
		defer outboxTicker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-outboxTicker.C:
				tickCtx, cancelTick := context.WithTimeout(ctx, outboxTickTimeout)
				count, err := stockTransactionService.DispatchPendingOutboxEvents(tickCtx)
				cancelTick()
				if err != nil {
					if ctx.Err() == nil {
						log.Printf("[Outbox] Dispatch error: %v", err)
					}
				} else if count > 0 {
					log.Printf("[Outbox] Dispatched %d events", count)
				}
			}
		}
	}()

	bgWg.Add(1)
	go func() {
		defer bgWg.Done()
		log.Println("Starting Kelja Fulfillment Reconciler (Safety Net)...")
		reconcileTicker := time.NewTicker(reconcileInterval)
		defer reconcileTicker.Stop()

		runReconcile := func(label string) {
			tickCtx, cancelTick := context.WithTimeout(ctx, reconcileTickTimeout)
			defer cancelTick()
			if count, err := stockTransactionService.ReconcileMissingFulfillments(tickCtx); err != nil {
				if ctx.Err() == nil {
					log.Printf("[Reconciliation] %s error: %v", label, err)
				}
			} else if count > 0 {
				log.Printf("[Reconciliation] %s reconciled %d missing fulfillments", label, count)
			}
		}

		// Initial check after startup warmup
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconcileWarmupDelay):
			runReconcile("Startup check")
		}

		for {
			select {
			case <-ctx.Done():
				return
			case <-reconcileTicker.C:
				runReconcile("Periodic check")
			}
		}
	}()

	log.Println("Worker started. Polling for jobs...")

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Shutting down worker, waiting for background routines...")
			bgWg.Wait()
			log.Println("Worker stopped cleanly.")
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

func extractLocaleFromJSON(rawJSON *string) string {
	if rawJSON == nil || strings.TrimSpace(*rawJSON) == "" {
		return i18n.DefaultLocale
	}
	var m struct {
		Locale string `json:"_locale"`
	}
	if err := json.Unmarshal([]byte(*rawJSON), &m); err == nil && m.Locale != "" {
		return m.Locale
	}
	return i18n.DefaultLocale
}

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
		dispatchConfig{Concurrency: maxConcurrentJobs, JobTimeout: jobExecutionTimeout, Name: "import"},
		jobRepo.ClaimNextImportJob,
		func(ctx context.Context, job *system_domain.ImportJob) error {
			filePath := utils.ResolveStoragePath(job.FilePath)
			log.Printf("Found PENDING import job: %d (%s), file: %s (resolved: %s)", job.ID, job.JobType, job.FilePath, filePath)

			locale := extractLocaleFromJSON(job.Options)
			jobCtx := i18n.WithLocale(ctx, locale)

			// Execute Job
			var processErr error
			var logSummary string
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[import] Panic recovered on job %d: %v\n%s", job.ID, r, debug.Stack())
						processErr = fmt.Errorf("internal worker panic: %v", r)
					}
				}()

				switch job.JobType {
				case "IMPORT_ATTENDANCE":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = attendanceService.ProcessImport(jobCtx, job.ID, filePath, false)
				case "IMPORT_ATTENDANCE_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = attendanceService.ProcessImport(jobCtx, job.ID, filePath, true)
				case "IMPORT_SCHEDULES":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = scheduleService.ProcessImport(jobCtx, job.ID, filePath, job.UserID)
				case "BATCH_EDIT_PRODUCT":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchUpdate(jobCtx, job.ID, filePath, job.UserID, false)
				case "BATCH_EDIT_PRODUCT_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchUpdate(jobCtx, job.ID, filePath, job.UserID, true)
				case "IMPORT_PACKAGES":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchPackageUpdate(jobCtx, job.ID, filePath, job.UserID, false)
				case "IMPORT_PACKAGES_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = productService.ProcessBatchPackageUpdate(jobCtx, job.ID, filePath, job.UserID, true)
				case "IMPORT_MEDIA_BULK_LINK":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = mediaService.ProcessMediaLinkImport(jobCtx, filePath, job.UserID)
				case "ADJUST_STOCK":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessStockImport(jobCtx, job.ID, filePath, job.UserID, false)
				case "ADJUST_STOCK_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessStockImport(jobCtx, job.ID, filePath, job.UserID, true)
				case "IMPORT_STOCK_INBOUND":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessImportBatchInbound(jobCtx, job.ID, filePath, job.UserID, false)
				case "IMPORT_STOCK_INBOUND_DRY_RUN":
					log.Printf("Processing %s: %s", job.JobType, filePath)
					logSummary, processErr = stockService.ProcessImportBatchInbound(jobCtx, job.ID, filePath, job.UserID, true)
				default:
					log.Printf("Unknown job type: %s", job.JobType)
					processErr = fmt.Errorf("unknown job type: %s", job.JobType)
				}
			}()

			// Use a non-canceled context with short timeout so shutdown signals do not leave jobs stuck in PROCESSING.
			statusCtx, cancelStatus := context.WithTimeout(context.WithoutCancel(ctx), jobStatusUpdateTimeout)
			defer cancelStatus()

			if processErr != nil {
				log.Printf("Job %d failed: %v", job.ID, processErr)
				errSummary := processErr.Error()
				if logSummary != "" {
					errSummary = fmt.Sprintf("%s | %s", logSummary, errSummary)
				}
				if job.JobType != "SYNC_API_KELJA" {
					if errLog := jobService.UpdateImportJobStatusWithSummary(statusCtx, job.ID, "FAILED", errSummary); errLog != nil {
						log.Printf("Failed to update job status: %v", errLog)
					}
				}
				_ = firebaseService.EmitSharedTaskSignal(statusCtx, "BACKGROUND_JOBS", "IMPORT_FAILED")
			} else {
				if logSummary == "" {
					logSummary = i18n.T(jobCtx, "system.jobs.completed_summary", map[string]any{"type": job.JobType})
					if logSummary == "system.jobs.completed_summary" || logSummary == "" {
						logSummary = fmt.Sprintf("Job %s selesai diproses.", job.JobType)
					}
				}
				log.Printf("Job %d completed with summary: %s", job.ID, logSummary)
				if job.JobType != "SYNC_API_KELJA" {
					if errLog := jobService.UpdateImportJobStatusWithSummary(statusCtx, job.ID, "COMPLETED", logSummary); errLog != nil {
						log.Printf("Failed to update job status: %v", errLog)
					}
				}
				_ = firebaseService.EmitSharedTaskSignal(statusCtx, "BACKGROUND_JOBS", "IMPORT_COMPLETED")
				if job.JobType == "IMPORT_ATTENDANCE" {
					_ = firebaseService.EmitSharedTaskSignal(statusCtx, "HRIS_ATTENDANCE", "REFRESH_ATTENDANCE")
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
		dispatchConfig{Concurrency: maxConcurrentJobs, JobTimeout: jobExecutionTimeout, Name: "export"},
		jobRepo.ClaimNextExportJob,
		func(ctx context.Context, job *system_domain.ExportJob) error {
			log.Printf("Found PENDING export job: %d (%s)", job.ID, job.JobType)

			locale := extractLocaleFromJSON(job.Filters)
			jobCtx := i18n.WithLocale(ctx, locale)

			var processErr error
			filtersJSON := ""
			if job.Filters != nil {
				filtersJSON = *job.Filters
			}

			cleanJobType := strings.TrimSpace(job.JobType)
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[export] Panic recovered on job %d: %v\n%s", job.ID, r, debug.Stack())
						processErr = fmt.Errorf("internal export worker panic: %v", r)
					}
				}()

				switch cleanJobType {
				case "STATISTICS_STOCK_MOVEMENT":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportStockMovement(jobCtx, job.ID, filtersJSON)
				case "STATISTICS_STOCK_TIMELINE":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportStockTimeline(jobCtx, job.ID, filtersJSON)
				case "STOCK_REPORT":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportStockReport(jobCtx, job.ID, filtersJSON)
				case "BATCH_LOG_EXPORT":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportBatchLog(jobCtx, job.ID, filtersJSON)
				case "STATISTICS_LOCATION_CAPACITY":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportLocationCapacity(jobCtx, job.ID, filtersJSON)
				case "PRODUCT_MASTER":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportProduct(jobCtx, job.ID, filtersJSON)
				case "EXPORT_PACKAGES":
					log.Printf("Processing %s", job.JobType)
					processErr = exportService.ProcessExportPackage(jobCtx, job.ID, filtersJSON)
				default:
					log.Printf("Unknown export job type: %s (hex: %x)", job.JobType, job.JobType)
					processErr = fmt.Errorf("unknown export job type: %s", job.JobType)
				}
			}()

			statusCtx, cancelStatus := context.WithTimeout(context.WithoutCancel(ctx), jobStatusUpdateTimeout)
			defer cancelStatus()

			if processErr != nil {
				log.Printf("Export Job %d failed: %v", job.ID, processErr)
				errMsg := processErr.Error()
				if errLog := jobService.UpdateExportJobStatus(statusCtx, job.ID, "FAILED", nil, &errMsg); errLog != nil {
					log.Printf("Failed to update job status: %v", errLog)
				}
				_ = firebaseService.EmitSharedTaskSignal(statusCtx, "BACKGROUND_JOBS", "EXPORT_FAILED")
			} else {
				log.Printf("Export Job %d completed successfully", job.ID)
				// Job status is updated by the service (ProcessExportStockReport etc)
				_ = firebaseService.EmitSharedTaskSignal(statusCtx, "BACKGROUND_JOBS", "EXPORT_COMPLETED")
			}
			return processErr
		},
	)
}
