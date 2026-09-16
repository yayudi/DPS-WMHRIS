package main

import (
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

	catalog_repo "github.com/dps-wmhris/backend/internal/modules/catalog/repository"
	catalog_service "github.com/dps-wmhris/backend/internal/modules/catalog/service"
	hris_repo "github.com/dps-wmhris/backend/internal/modules/hris/repository"
	hris_service "github.com/dps-wmhris/backend/internal/modules/hris/service"
	iam_repo "github.com/dps-wmhris/backend/internal/modules/iam/repository"
	inventory_repo "github.com/dps-wmhris/backend/internal/modules/inventory/repository"
	inventory_service "github.com/dps-wmhris/backend/internal/modules/inventory/service"

	"github.com/dps-wmhris/backend/internal/model"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/service"
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

	jobRepo := repository.NewJobRepository(db)
	jobService := service.NewJobService(jobRepo)

	statisticRepo := repository.NewStatisticRepository(db)
	statisticService := service.NewStatisticService(statisticRepo, jobRepo)
	storageService := service.NewStorageService()
	stockRepo := inventory_repo.NewStockRepository(db)
	reportRepo := repository.NewReportRepository(db)
	productRepo := catalog_repo.NewProductRepository(db)
	categoryRepo := catalog_repo.NewCategoryRepository(db)
	exportService := service.NewExportService(jobRepo, statisticService, storageService, stockRepo, reportRepo, productRepo, categoryRepo)

	attendanceRepo := hris_repo.NewAttendanceRepository(db)
	userRepo := iam_repo.NewUserRepository(db)
	shiftRepo := hris_repo.NewShiftRepository(db)
	scheduleRepo := hris_repo.NewScheduleRepository(db)
	settingRepo := repository.NewSettingRepository(db)
	attendanceService := hris_service.NewAttendanceService(attendanceRepo, userRepo, shiftRepo, scheduleRepo, settingRepo)

	pickingRepo := inventory_repo.NewPickingRepository(db)
	locationRepo := inventory_repo.NewLocationRepository(db)
	pickingService := inventory_service.NewPickingService(db, pickingRepo, locationRepo, stockRepo, jobService, productRepo)
	stockService := inventory_service.NewStockService(db, stockRepo, productRepo, locationRepo, userRepo, pickingRepo)
	firebaseService := service.NewFirebaseSignalService()
	scheduleService := hris_service.NewScheduleService(scheduleRepo, shiftRepo, userRepo)

	productAuditRepo := catalog_repo.NewProductAuditRepository()
	productService := catalog_service.NewProductService(db, productRepo, productAuditRepo, categoryRepo)

	mediaRepo := repository.NewMediaRepository(db)
	mediaService := service.NewMediaService(db, mediaRepo, productRepo, storageService)

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

func processPendingImportJobs(ctx context.Context, db *sqlx.DB, jobRepo repository.JobRepository, jobService service.JobService, attendanceService hris_service.AttendanceService, pickingService inventory_service.PickingService, stockService inventory_service.StockService, scheduleService hris_service.ScheduleService, productService catalog_service.ProductService, firebaseService service.FirebaseSignalService, mediaService service.MediaService) {
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

		job, err := jobRepo.ClaimNextImportJob(ctx, tx)
		if err != nil {
			_ = tx.Rollback() // #nosec G104
			<-sem
			break // No more jobs or error
		}
		_ = tx.Commit() // #nosec G104

		wg.Add(1)
		go func(job model.ImportJob) {
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

func processPendingExportJobs(ctx context.Context, db *sqlx.DB, jobRepo repository.JobRepository, jobService service.JobService, exportService service.ExportService, firebaseService service.FirebaseSignalService) {
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

		job, err := jobRepo.ClaimNextExportJob(ctx, tx)
		if err != nil {
			_ = tx.Rollback() // #nosec G104
			<-sem
			break
		}
		_ = tx.Commit() // #nosec G104

		wg.Add(1)
		go func(job model.ExportJob) {
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
