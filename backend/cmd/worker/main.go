package main

import (
	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	analytics_usecase "github.com/dps-wmhris/backend/internal/modules/analytics/application/usecase"
	inventory_port "github.com/dps-wmhris/backend/internal/modules/inventory/port"
	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
	system_usecase "github.com/dps-wmhris/backend/internal/modules/system/application/usecase"

	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	catalog_port "github.com/dps-wmhris/backend/internal/modules/catalog/port"
	hris_port "github.com/dps-wmhris/backend/internal/modules/hris/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
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
		log.Fatalf("failed to initialize worker: %v", err)
	}

	jobService := container.JobService
	_ = container.StatisticService
	_ = container.StorageService
	exportService := container.ExportService
	attendanceService := container.AttendanceService
	pickingService := container.PickingService
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

	go func() {
		<-sigChan
		log.Println("Shutting down worker...")
		cancel()
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
			processPendingImportJobs(ctx, db, jobRepo, jobService, attendanceService, pickingService, stockService, scheduleService, productService, firebaseService, mediaService)
			processPendingExportJobs(ctx, db, jobRepo, jobService, exportService, firebaseService)
		}
	}
}

const maxConcurrentJobs = 3

func processPendingImportJobs(ctx context.Context, db *sqlx.DB, jobRepo system_mysql.JobRepository, jobService system_usecase.JobService, attendanceService hris_port.AttendanceUseCase, pickingService inventory_port.PickingUseCase, stockService inventory_port.StockUseCase, scheduleService hris_port.ScheduleUseCase, productService catalog_port.ProductUseCase, firebaseService system_usecase.FirebaseSignalService, mediaService system_usecase.MediaService) {
	sem := make(chan struct{}, maxConcurrentJobs)
	var wg sync.WaitGroup

	for {
		sem <- struct{}{} // Wait for an available slot

		tx, err := db.BeginTxx(ctx, nil)
		if err != nil {
			log.Printf("Error starting tx: %v", err)
			<-sem
			break
		}

		job, err := jobRepo.ClaimNextImportJob(ctx)
		if err != nil {
			_ = tx.Rollback() // #nosec G104
			<-sem
			break // No more jobs or error
		}
		_ = tx.Commit() // #nosec G104

		wg.Add(1)
		go func(job system_domain.ImportJob) {
			defer wg.Done()
			defer func() { <-sem }()

			// 10 minutes timeout per job
			ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			defer cancel()

			log.Printf("Found PENDING import job: %d (%s)", job.ID, job.JobType)

			// Execute Job
			var processErr error
			var logSummary string
			switch job.JobType {
			case "IMPORT_ATTENDANCE":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				logSummary, processErr = attendanceService.ProcessImport(ctx, job.ID, job.FilePath, false)
			case "IMPORT_ATTENDANCE_DRY_RUN":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				logSummary, processErr = attendanceService.ProcessImport(ctx, job.ID, job.FilePath, true)
			case "IMPORT_SCHEDULES":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				msg, err := scheduleService.ProcessImport(ctx, job.ID, job.FilePath, job.UserID)
				processErr = err
				if processErr == nil {
					logSummary = msg
				}
			case "BATCH_EDIT_PRODUCT":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				msg, err := productService.ProcessBatchUpdate(ctx, job.ID, job.FilePath, job.UserID, false)
				processErr = err
				if processErr == nil {
					logSummary = msg
				}
			case "BATCH_EDIT_PRODUCT_DRY_RUN":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				msg, err := productService.ProcessBatchUpdate(ctx, job.ID, job.FilePath, job.UserID, true)
				processErr = err
				if processErr == nil {
					logSummary = msg
				}
			case "IMPORT_MEDIA_BULK_LINK":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				msg, err := mediaService.ProcessMediaLinkImport(ctx, job.FilePath, job.UserID)
				processErr = err
				if processErr == nil {
					logSummary = msg
				}
			case "ADJUST_STOCK":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				processErr = stockService.ProcessStockImport(ctx, job.ID, job.FilePath, job.UserID, false)
			case "ADJUST_STOCK_DRY_RUN":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				processErr = stockService.ProcessStockImport(ctx, job.ID, job.FilePath, job.UserID, true)
			case "IMPORT_STOCK_INBOUND":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				logSummary, processErr = stockService.ProcessImportBatchInbound(ctx, job.ID, job.FilePath, job.UserID, false)
			case "IMPORT_STOCK_INBOUND_DRY_RUN":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				logSummary, processErr = stockService.ProcessImportBatchInbound(ctx, job.ID, job.FilePath, job.UserID, true)
			case "IMPORT_SALES_TOKOPEDIA", "IMPORT_SALES_SHOPEE", "IMPORT_SALES_TIKTOK", "IMPORT_SALES_MANUAL":
				log.Printf("Processing %s: %s", job.JobType, job.FilePath)
				sourceMap := map[string]string{
					"IMPORT_SALES_TOKOPEDIA": "Tokopedia",
					"IMPORT_SALES_SHOPEE":    "Shopee",
					"IMPORT_SALES_TIKTOK":    "TikTok",
					"IMPORT_SALES_MANUAL":    "Offline",
				}
				source := sourceMap[job.JobType]

				shopName := ""
				locationPurpose := "DISPLAY"
				if job.Options != nil {
					var opts map[string]interface{}
					if err := json.Unmarshal([]byte(*job.Options), &opts); err == nil {
						if val, ok := opts["shopName"].(string); ok {
							shopName = val
						}
						if val, ok := opts["purpose"].(string); ok {
							locationPurpose = val
						}
					}
				}

				processErr = pickingService.ProcessSalesImport(ctx, job.ID, job.FilePath, source, job.UserID, false, locationPurpose, shopName)
			case "IMPORT_SALES_TOKOPEDIA_DRY_RUN", "IMPORT_SALES_SHOPEE_DRY_RUN", "IMPORT_SALES_TIKTOK_DRY_RUN", "IMPORT_SALES_MANUAL_DRY_RUN":
				log.Printf("Processing %s (Dry Run): %s", job.JobType, job.FilePath)
				sourceMap := map[string]string{
					"IMPORT_SALES_TOKOPEDIA_DRY_RUN": "Tokopedia",
					"IMPORT_SALES_SHOPEE_DRY_RUN":    "Shopee",
					"IMPORT_SALES_TIKTOK_DRY_RUN":    "TikTok",
					"IMPORT_SALES_MANUAL_DRY_RUN":    "Offline",
				}
				source := sourceMap[job.JobType]

				shopName := ""
				locationPurpose := "DISPLAY"
				if job.Options != nil {
					var opts map[string]interface{}
					if err := json.Unmarshal([]byte(*job.Options), &opts); err == nil {
						if val, ok := opts["shopName"].(string); ok {
							shopName = val
						}
						if val, ok := opts["purpose"].(string); ok {
							locationPurpose = val
						}
					}
				}

				processErr = pickingService.ProcessSalesImport(ctx, job.ID, job.FilePath, source, job.UserID, true, locationPurpose, shopName)
			default:
				log.Printf("Unknown job type: %s", job.JobType)
				processErr = fmt.Errorf("unknown job type: %s", job.JobType)
			}

			// Update job status
			if processErr != nil {
				log.Printf("Job %d failed: %v", job.ID, processErr)
				if errLog := jobService.UpdateImportJobStatus(ctx, job.ID, "FAILED"); errLog != nil {
					log.Printf("Failed to update job status: %v", errLog)
				}
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "IMPORT_FAILED")
			} else if logSummary != "" {
				log.Printf("Job %d completed with summary: %s", job.ID, logSummary)
				if errLog := jobService.UpdateImportJobStatusWithSummary(ctx, job.ID, "COMPLETED", logSummary); errLog != nil {
					log.Printf("Failed to update job status: %v", errLog)
				}
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "IMPORT_COMPLETED")
				if job.JobType == "IMPORT_ATTENDANCE" {
					_ = firebaseService.EmitSharedTaskSignal(ctx, "HRIS_ATTENDANCE", "REFRESH_ATTENDANCE")
				}
			} else {
				log.Printf("Job %d completed", job.ID)
				if errLog := jobService.UpdateImportJobStatus(ctx, job.ID, "COMPLETED"); errLog != nil {
					log.Printf("Failed to update job status: %v", errLog)
				}
				_ = firebaseService.EmitSharedTaskSignal(ctx, "BACKGROUND_JOBS", "IMPORT_COMPLETED")
				if job.JobType == "IMPORT_ATTENDANCE" {
					_ = firebaseService.EmitSharedTaskSignal(ctx, "HRIS_ATTENDANCE", "REFRESH_ATTENDANCE")
				}
			}
		}(*job)
	}

	wg.Wait()
}

func processPendingExportJobs(ctx context.Context, db *sqlx.DB, jobRepo system_mysql.JobRepository, jobService system_usecase.JobService, exportService analytics_usecase.ExportService, firebaseService system_usecase.FirebaseSignalService) {
	sem := make(chan struct{}, maxConcurrentJobs)
	var wg sync.WaitGroup

	for {
		sem <- struct{}{}

		tx, err := db.BeginTxx(ctx, nil)
		if err != nil {
			log.Printf("Error starting tx: %v", err)
			<-sem
			break
		}

		job, err := jobRepo.ClaimNextExportJob(ctx)
		if err != nil {
			_ = tx.Rollback() // #nosec G104
			<-sem
			break
		}
		_ = tx.Commit() // #nosec G104

		wg.Add(1)
		go func(job system_domain.ExportJob) {
			defer wg.Done()
			defer func() { <-sem }()

			// 10 minutes timeout per job
			ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
			defer cancel()

			log.Printf("Found PENDING export job: %d (%s)", job.ID, job.JobType)

			var processErr error
			filtersJSON := ""
			if job.Filters != nil {
				filtersJSON = *job.Filters
			}

			cleanJobType := strings.TrimSpace(job.JobType)
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
		}(*job)
	}

	wg.Wait()
}
