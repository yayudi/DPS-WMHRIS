package main

import (
	"log"

	"github.com/dps-wmhris/backend/internal/config"
	"github.com/dps-wmhris/backend/internal/database"
	"github.com/dps-wmhris/backend/internal/handler"
	"github.com/dps-wmhris/backend/internal/middleware"
	"github.com/dps-wmhris/backend/internal/repository"
	"github.com/dps-wmhris/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load Configurations
	config.LoadConfig()
	config.InitFirebase()

	// Setup Database Connection
	db := database.ConnectDB()
	defer db.Close()

	// Initialize Gin Router
	if config.AppConfig.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Setup Dependencies
	systemLogRepo := repository.NewSystemLogRepository(db)
	systemLogService := service.NewSystemLogService(systemLogRepo)
	systemLogHandler := handler.NewSystemLogHandler(systemLogService)

	roleRepo := repository.NewRoleRepository(db)
	roleService := service.NewRoleService(db, roleRepo, systemLogRepo)
	roleHandler := handler.NewRoleHandler(roleService)

	userRepo := repository.NewUserRepository(db)
	userService := service.NewUserService(db, userRepo, systemLogRepo)
	userHandler := handler.NewUserHandler(userService)

	adminUserRepo := repository.NewAdminUserRepository(db)
	adminUserService := service.NewAdminUserService(db, adminUserRepo, roleRepo, systemLogRepo)
	adminUserHandler := handler.NewAdminUserHandler(adminUserService)

	salesChannelRepo := repository.NewSalesChannelRepository(db)
	salesChannelService := service.NewSalesChannelService(db, salesChannelRepo, systemLogRepo)
	salesChannelHandler := handler.NewSalesChannelHandler(salesChannelService)

	paperSizeRepo := repository.NewPaperSizeRepository(db)
	paperSizeService := service.NewPaperSizeService(db, paperSizeRepo, systemLogRepo)
	paperSizeHandler := handler.NewPaperSizeHandler(paperSizeService)

	stickerTemplateRepo := repository.NewStickerTemplateRepository(db)
	stickerTemplateService := service.NewStickerTemplateService(db, stickerTemplateRepo, systemLogRepo)
	stickerTemplateHandler := handler.NewStickerTemplateHandler(stickerTemplateService)

	firebaseService := service.NewFirebaseSignalService()

	notificationRepo := repository.NewNotificationRepository(db)
	notificationService := service.NewNotificationService(db, notificationRepo, firebaseService)
	notificationHandler := handler.NewNotificationHandler(notificationService)

	jobRepo := repository.NewJobRepository(db)
	jobService := service.NewJobService(jobRepo)
	jobHandler := handler.NewJobHandler(jobService)

	storageService := service.NewStorageService()
	uploadHandler := handler.NewUploadHandler(storageService)
	
	productRepo := repository.NewProductRepository(db)
	
	mediaRepo := repository.NewMediaRepository(db)
	mediaService := service.NewMediaService(db, mediaRepo, productRepo, storageService)
	mediaHandler := handler.NewMediaHandler(db, mediaService, storageService, jobService)

	categoryRepo := repository.NewCategoryRepository(db)
	categoryService := service.NewCategoryService(categoryRepo)
	categoryHandler := handler.NewCategoryHandler(categoryService)

	productAuditRepo := repository.NewProductAuditRepository()
	productService := service.NewProductService(db, productRepo, productAuditRepo, categoryRepo)
	productHandler := handler.NewProductHandler(productService, jobService)

	locationRepo := repository.NewLocationRepository(db)
	locationService := service.NewLocationService(db, locationRepo, systemLogRepo)
	locationHandler := handler.NewLocationHandler(locationService)

	pickingRepo := repository.NewPickingRepository(db)

	stockRepo := repository.NewStockRepository(db)
	stockService := service.NewStockService(db, stockRepo, productRepo, locationRepo, userRepo, pickingRepo)
	stockHandler := handler.NewStockHandler(stockService, jobService)

	stockRequestRepo := repository.NewStockRequestRepository(db)
	stockRequestService := service.NewStockRequestService(db, stockRequestRepo, stockService, notificationService)
	stockRequestHandler := handler.NewStockRequestHandler(stockRequestService)

	packageHandler := handler.NewPackageHandler(jobService)

	returnRepo := repository.NewReturnRepository(db)
	returnService := service.NewReturnService(db, returnRepo, locationRepo, stockRepo)
	returnHandler := handler.NewReturnHandler(returnService)

	investigationRepo := repository.NewInvestigationRepository(db)
	investigationService := service.NewInvestigationService(db, investigationRepo, locationRepo, stockRepo)
	investigationHandler := handler.NewInvestigationHandler(investigationService)

	statsRepo := repository.NewStatsRepository(db)
	statsService := service.NewStatsService(statsRepo)
	statsHandler := handler.NewStatsHandler(statsService)

	reportRepo := repository.NewReportRepository(db)
	reportService := service.NewReportService(reportRepo)
	reportHandler := handler.NewReportHandler(reportService, jobService)

	statisticRepo := repository.NewStatisticRepository(db)
	statisticService := service.NewStatisticService(statisticRepo, jobRepo)
	statisticHandler := handler.NewStatisticHandler(statisticService)

	shiftRepo := repository.NewShiftRepository(db)
	shiftService := service.NewShiftService(db, shiftRepo)
	shiftHandler := handler.NewShiftHandler(shiftService)

	pickingService := service.NewPickingService(db, pickingRepo, locationRepo, stockRepo, jobService, productRepo)
	pickingHandler := handler.NewPickingHandler(jobService, pickingService)

	scheduleRepo := repository.NewScheduleRepository(db)
	scheduleService := service.NewScheduleService(scheduleRepo, shiftRepo, userRepo)
	scheduleHandler := handler.NewScheduleHandler(scheduleService, jobService)

	settingRepo := repository.NewSettingRepository(db)
	attendanceRepo := repository.NewAttendanceRepository(db)
	attendanceService := service.NewAttendanceService(attendanceRepo, userRepo, shiftRepo, scheduleRepo, settingRepo)
	attendanceHandler := handler.NewAttendanceHandler(attendanceService, jobService)

	// Setup Router
	r := gin.Default()
	r.Static("/assets", "./assets")
	r.Use(middleware.GlobalErrorHandler())

	// CORS setup
	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		// Test/Health route
		api.GET("/test", func(c *gin.Context) {
			c.JSON(200, gin.H{"success": true, "message": "Server is running"})
		})

		// Auth route (unprotected)
		api.POST("/auth/login", userHandler.Login)
		api.POST("/auth/logout", userHandler.Logout)

		// Protected routes
		protected := api.Group("/")
		protected.Use(middleware.AuthMiddleware())
		{
			// User
			user := protected.Group("/user")
			{
				user.GET("/profile", userHandler.GetProfile)
				user.PUT("/profile", userHandler.UpdateProfile)
				user.GET("/my-locations", userHandler.GetMyLocations)
			}
			// Categories
			protected.GET("/categories", categoryHandler.GetAllActive)
			protected.POST("/categories", categoryHandler.Create)
			protected.PUT("/categories/:id", categoryHandler.Update)
			protected.DELETE("/categories/:id", categoryHandler.Delete)

			// Locations
			locations := protected.Group("/locations")
			{
				locations.GET("", locationHandler.GetAll)
				locations.POST("", locationHandler.Create)
				locations.PUT("/:id", locationHandler.Update)
				locations.DELETE("/:id", locationHandler.Delete)
				locations.GET("/:id/stock-sample", locationHandler.GetStockSample)
			}
			// Stock Requests
			stockRequests := protected.Group("/stock-requests")
			{
				stockRequests.GET("", stockRequestHandler.GetAll)
				stockRequests.POST("", stockRequestHandler.Create)
				stockRequests.POST("/bulk-action", stockRequestHandler.BulkAction)
				stockRequests.POST("/:id/approve", stockRequestHandler.Approve)
				stockRequests.POST("/:id/reject", stockRequestHandler.Reject)
				stockRequests.POST("/:id/dispatch", stockRequestHandler.Dispatch)
				stockRequests.POST("/:id/complete", stockRequestHandler.Complete)
			}

			// Stock Movements
			// Stocks
			stock := protected.Group("/stock")
			{
				stock.GET("", stockHandler.GetAllStocks)
				stock.POST("/transfer", stockHandler.TransferStock)
				stock.POST("/adjust", stockHandler.AdjustStock)
				stock.POST("/batch-process", stockHandler.BatchProcess) // Match frontend endpoint exactly
				stock.GET("/movement-types", stockHandler.GetMovementTypes)
				stock.GET("/batch-log", stockHandler.GetBatchLogs)
				stock.GET("/history/:productId", stockHandler.GetStockHistory)
				stock.POST("/import-batch", stockHandler.ImportBatchInbound)
				
				// New endpoints for Stock matching Node.js
				stock.POST("/batch-transfer", stockHandler.BatchTransfer)
				stock.POST("/validate-return", stockHandler.ValidateReturn)
				stock.POST("/batch-log/export", stockHandler.RequestBatchLogExport)
				stock.GET("/template/inbound", stockHandler.GetInboundTemplate)
				stock.GET("/download-adjustment-template", stockHandler.DownloadAdjustmentTemplate)
				stock.POST("/request-adjustment-upload", stockHandler.RequestAdjustmentUpload)
				stock.GET("/import-jobs", jobHandler.GetImportJobs)
				stock.POST("/import-jobs/:id/void", jobHandler.CancelImportJob)
			}

			// Returns
			returns := protected.Group("/returns")
			{
				returns.GET("/pending", returnHandler.GetPendingReturns)
				returns.GET("/history", returnHandler.GetReturnHistory)
				returns.POST("/approve", returnHandler.ApproveReturn)
				returns.POST("/manual-entry", returnHandler.CreateManualReturn)
			}
			
			// Alias for Returns (to match Node.js apiRouter.use("/return", ...))
			returnAlias := protected.Group("/return")
			{
				returnAlias.GET("/pending", returnHandler.GetPendingReturns)
				returnAlias.GET("/history", returnHandler.GetReturnHistory)
				returnAlias.POST("/approve", returnHandler.ApproveReturn)
				returnAlias.POST("/manual-entry", returnHandler.CreateManualReturn)
			}

			// Investigation
			investigation := protected.Group("/investigation")
			{
				investigation.GET("/duplicates", investigationHandler.GetDuplicateTransactions)
				investigation.POST("/revert/:id", investigationHandler.RevertTransaction)
			}

			// Packages
			packages := protected.Group("/packages")
			{
				packages.GET("/export", packageHandler.ExportPackages)
				packages.POST("/batch/update", packageHandler.ImportPackagesBatch)
			}

			// Stats
			stats := protected.Group("/stats")
			{
				stats.GET("/kpi-summary", statsHandler.FetchKpiSummary)
			}

			// Reports
			reports := protected.Group("/reports")
			{
				reports.POST("/request-export-stock", reportHandler.RequestStockReport)
				reports.GET("/my-jobs", reportHandler.GetUserExportJobs)
				reports.GET("/filters", reportHandler.FetchReportFilters)
			}

			// Products
			products := protected.Group("/products")
			{
				products.GET("", productHandler.GetProducts)
				products.GET("/search", productHandler.SearchProducts)
				products.GET("/admin-list", productHandler.GetAdminList)
				products.GET("/export", productHandler.ExportProducts)
				products.GET("/:id", productHandler.GetProductById)
				products.GET("/:id/stock-details", productHandler.GetProductStockDetails)
				products.GET("/:id/history", productHandler.GetProductHistory)
				products.GET("/:id/stock-timeline", productHandler.GetProductStockTimeline)
				products.POST("", productHandler.Create)
				products.PUT("/:id", productHandler.Update)
				products.DELETE("/:id", productHandler.Delete)
				products.POST("/batch/product-update", productHandler.ImportBatchProductUpdate)
				products.POST("/:id/link-media", productHandler.LinkMedia)
				products.PUT("/:id/images/:imageId/primary", productHandler.SetPrimaryImage)
				products.DELETE("/:id/images/:imageId", productHandler.DeleteProductImage)
			}

			// Picking
			picking := protected.Group("/picking")
			{
				picking.POST("/upload-and-validate", pickingHandler.UploadAndValidate)
				picking.GET("/pending-items", pickingHandler.GetPendingItems)
				picking.GET("/history-items", pickingHandler.GetHistoryItems)
				picking.GET("/:id", pickingHandler.GetPickingDetail)
				picking.POST("/complete-items", pickingHandler.CompleteItems)
				picking.POST("/void/:id", pickingHandler.VoidPickingList)
				picking.POST("/:id/retry-backorders", pickingHandler.RetryBackorders)
				picking.POST("/retry-backorders-batch", pickingHandler.RetryBackordersBatch)
			}

			// RBAC
			roles := protected.Group("/admin/roles")
			{
				roles.GET("", roleHandler.GetRoles)
				roles.GET("/permissions", roleHandler.GetPermissions)
				roles.GET("/:id/permissions", roleHandler.GetRolePermissions)
				roles.PUT("/:id/permissions", roleHandler.AssignPermissions)
				roles.POST("", roleHandler.CreateRole)
				roles.PUT("/:id", roleHandler.UpdateRole)
				roles.DELETE("/:id", roleHandler.DeleteRole)
			}

			// Admin Users
			adminUsers := protected.Group("/admin/users")
			{
				adminUsers.GET("", adminUserHandler.GetUsers)
				adminUsers.POST("", adminUserHandler.CreateUser)
				adminUsers.GET("/roles", adminUserHandler.GetRoles)
				adminUsers.PUT("/:id", adminUserHandler.UpdateUser)
				adminUsers.DELETE("/:id", adminUserHandler.DeleteUser)
				adminUsers.GET("/:id/locations", adminUserHandler.GetUserLocations)
				adminUsers.PUT("/:id/locations", adminUserHandler.UpdateUserLocations)
			}
			
			// System Logs
			protected.GET("/logs", systemLogHandler.GetLogs)


			salesChannels := protected.Group("/sales-channels")
			{
				salesChannels.GET("", salesChannelHandler.GetAllChannels)
				salesChannels.GET("/:id", salesChannelHandler.GetChannelByID)
				salesChannels.POST("", salesChannelHandler.CreateChannel)
				salesChannels.PUT("/:id", salesChannelHandler.UpdateChannel)
				salesChannels.DELETE("/:id", salesChannelHandler.DeleteChannel)
			}

			paperSizes := protected.Group("/paper-sizes")
			{
				paperSizes.GET("", paperSizeHandler.GetAllPaperSizes)
				paperSizes.GET("/:id", paperSizeHandler.GetPaperSizeByID)
				paperSizes.POST("", paperSizeHandler.CreatePaperSize)
				paperSizes.PUT("/:id", paperSizeHandler.UpdatePaperSize)
				paperSizes.DELETE("/:id", paperSizeHandler.DeletePaperSize)
			}

			stickerTemplates := protected.Group("/sticker-templates")
			{
				stickerTemplates.GET("", stickerTemplateHandler.GetAllStickerTemplates)
				stickerTemplates.GET("/:id", stickerTemplateHandler.GetStickerTemplateByID)
				stickerTemplates.POST("", stickerTemplateHandler.CreateStickerTemplate)
				stickerTemplates.PUT("/:id", stickerTemplateHandler.UpdateStickerTemplate)
				stickerTemplates.DELETE("/:id", stickerTemplateHandler.DeleteStickerTemplate)
			}

			notifications := protected.Group("/notifications")
			{
				notifications.GET("/recent", notificationHandler.GetRecentPending)
				notifications.GET("/preferences", notificationHandler.GetPreferences)
				notifications.PUT("/preferences", notificationHandler.UpdatePreferences)
				notifications.PUT("/:id/done", notificationHandler.MarkAsDone)
				notifications.PUT("/:id/claim", notificationHandler.ClaimNotification)
				notifications.GET("", notificationHandler.GetAll)
			}

			upload := protected.Group("/upload")
			{
				upload.POST("/presigned-url", uploadHandler.GetPresignedUrl)
			}

			media := protected.Group("/media")
			{
				media.GET("", mediaHandler.ListMedia)
				media.GET("/status", mediaHandler.GetMediaStatus)
				media.GET("/bulk-link-template", mediaHandler.DownloadBulkLinkTemplate)
				media.GET("/:id", mediaHandler.GetMediaByID)
				media.POST("/presigned-url", mediaHandler.GetPresignedUrls)
				media.POST("/confirm", mediaHandler.ConfirmUpload)
				media.POST("/bulk-link-excel", mediaHandler.BulkLinkExcel)
				media.DELETE("/:id", mediaHandler.DeleteMedia)
				media.PUT("/:id/tags", mediaHandler.UpdateMediaTags)
				media.PUT("/:id/title", mediaHandler.UpdateMediaTitle)
			}

			protected.POST("/schedules", scheduleHandler.CreateSchedule)
			protected.DELETE("/schedules", scheduleHandler.DeleteSchedule)
			protected.GET("/schedules/template", scheduleHandler.DownloadTemplate)
			protected.POST("/schedules/import", scheduleHandler.UploadImportSchedule)

			// HRIS: Shifts
			protected.GET("/shifts", shiftHandler.GetAll)
			protected.GET("/shifts/:id", shiftHandler.GetByID)
			protected.POST("/shifts", shiftHandler.Create)
			protected.PUT("/shifts/:id", shiftHandler.Update)
			protected.DELETE("/shifts/:id", shiftHandler.Delete)

			// HRIS: Schedules
			protected.GET("/schedules", scheduleHandler.GetSchedules)

			// HRIS: Attendance
			protected.GET("/attendance/indexes", attendanceHandler.GetIndexes)
			protected.GET("/attendance/history", attendanceHandler.GetHistory)
			protected.GET("/attendance/range", attendanceHandler.GetRangeData)
			protected.GET("/attendance/:year/:month", attendanceHandler.GetMonthlyData)
			protected.POST("/attendance/update", attendanceHandler.UpdateLog)
			protected.POST("/attendance/upload", attendanceHandler.UploadLogs)

			// System: Jobs
			protected.GET("/jobs/import", jobHandler.GetImportJobs)
			protected.DELETE("/jobs/import/:id", jobHandler.CancelImportJob)
			protected.GET("/jobs/export", jobHandler.GetExportJobs)
			protected.DELETE("/jobs/export/:id", jobHandler.CancelExportJob)

			statistics := protected.Group("/statistics")
			{
				statistics.GET("/stock-movements", statisticHandler.GetStockMovements)
				statistics.POST("/stock-movements/export", statisticHandler.RequestStockMovementsExport)
				statistics.GET("/inventory-value", statisticHandler.GetInventoryValue)
				statistics.GET("/stock-timeline", statisticHandler.GetStockTimeline)
				statistics.POST("/stock-timeline/export", statisticHandler.RequestStockTimelineExport)
				statistics.GET("/shop-performance", statisticHandler.GetShopPerformance)
				statistics.GET("/package-analysis", statisticHandler.GetPackageAnalysis)
				statistics.GET("/location-analysis", statisticHandler.GetLocationAnalysis)
			}
		}
	}

	// Start Server
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	if err := config.InitR2(); err != nil {
		log.Printf("Failed to init R2: %v", err)
	}

	log.Printf("Server is running on port %s", config.AppConfig.Port)
	if err := r.Run(":" + config.AppConfig.Port); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
