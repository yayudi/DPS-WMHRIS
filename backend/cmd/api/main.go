package main

import (
	"log"

	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
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
	container, err := InitializeAPI(db)
	if err != nil {
		log.Fatalf("failed to initialize api: %v", err)
	}

	systemLogHandler := container.SystemLogHandler
	roleHandler := container.RoleHandler
	userHandler := container.UserHandler
	adminUserHandler := container.AdminUserHandler
	salesChannelHandler := container.SalesChannelHandler
	paperSizeHandler := container.PaperSizeHandler
	stickerTemplateHandler := container.StickerTemplateHandler
	notificationHandler := container.NotificationHandler
	jobHandler := container.JobHandler
	uploadHandler := container.UploadHandler
	mediaHandler := container.MediaHandler
	categoryHandler := container.CategoryHandler
	productHandler := container.ProductHandler
	locationHandler := container.LocationHandler
	stockHandler := container.StockHandler
	stockRequestHandler := container.StockRequestHandler
	packageHandler := container.PackageHandler
	returnHandler := container.ReturnHandler
	investigationHandler := container.InvestigationHandler
	statsHandler := container.StatsHandler
	reportHandler := container.ReportHandler
	statisticHandler := container.StatisticHandler
	shiftHandler := container.ShiftHandler
	pickingHandler := container.PickingHandler
	scheduleHandler := container.ScheduleHandler
	attendanceHandler := container.AttendanceHandler

	// Setup Router
	r := gin.Default()
	r.Static("/assets", "./assets")
	r.Use(middleware.GlobalErrorHandler())

	// Global Rate Limiting: Maksimal 10 request per detik, burst 20
	r.Use(middleware.RateLimiter(10, 20))

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
			locations := protected.Group("/locations", middleware.RequirePermission(db, "location.manage"))
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
				stockRequests.POST("/:id/approve", middleware.RequirePermission(db, "stock_request.approve"), stockRequestHandler.Approve)
				stockRequests.POST("/:id/reject", middleware.RequirePermission(db, "stock_request.approve"), stockRequestHandler.Reject)
				stockRequests.POST("/:id/dispatch", stockRequestHandler.Dispatch)
				stockRequests.POST("/:id/complete", stockRequestHandler.Complete)
			}

			// Stock Movements
			// Stocks
			stock := protected.Group("/stock")
			{
				stock.GET("", stockHandler.GetAllStocks)
				stock.POST("/transfer", stockHandler.TransferStock)
				stock.POST("/adjust", middleware.RequirePermission(db, "stock_adjustment.manage"), stockHandler.AdjustStock)
				stock.POST("/batch-process", middleware.RequireAnyPermission(db, "stock_batch.manage", "stock_batch.move"), stockHandler.BatchProcess) // Match frontend endpoint exactly
				stock.GET("/movement-types", stockHandler.GetMovementTypes)
				stock.GET("/batch-log", stockHandler.GetBatchLogs)
				stock.GET("/history/:productId", stockHandler.GetStockHistory)
				stock.POST("/import-batch", middleware.RequireAnyPermission(db, "stock_batch.manage", "stock_batch.move"), stockHandler.ImportBatchInbound)

				// New endpoints for Stock matching Node.js
				stock.POST("/batch-transfer", middleware.RequireAnyPermission(db, "stock_batch.manage", "stock_batch.move"), stockHandler.BatchTransfer)
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
			reports := protected.Group("/reports", middleware.RequirePermission(db, "report.view"))
			{
				reports.POST("/request-export-stock", reportHandler.RequestStockReport)
				reports.GET("/my-jobs", reportHandler.GetUserExportJobs)
				reports.GET("/filters", reportHandler.FetchReportFilters)
			}

			// Exports
			exports := protected.Group("/exports")
			{
				exports.GET("/download/:id", reportHandler.DownloadExportJob)
			}

			// Products
			products := protected.Group("/products", middleware.RequirePermission(db, "product.manage"))
			{
				products.GET("", productHandler.GetProducts)
				products.GET("/search", productHandler.SearchProducts)
				products.GET("/admin-list", productHandler.GetAdminList)
				products.GET("/export", productHandler.ExportProducts)
				products.GET("/:id", productHandler.GetProductById)
				products.GET("/:id/stock-details", productHandler.GetProductStockDetails)
				products.GET("/:id/history", productHandler.GetProductHistory)
				products.GET("/:id/last-price-update", productHandler.GetProductLastPriceUpdate)
				products.GET("/:id/stock-timeline", productHandler.GetProductStockTimeline)
				products.POST("", productHandler.Create)
				products.PUT("/:id", productHandler.Update)
				products.DELETE("/:id", productHandler.Delete)
				products.POST("/batch/product-update", productHandler.ImportBatchProductUpdate)
				products.POST("/:id/link-media", middleware.RequireAnyPermission(db, "product_image.upload", "product_image.delete"), productHandler.LinkMedia)
				products.PUT("/:id/images/:imageId/primary", middleware.RequireAnyPermission(db, "product_image.upload", "product_image.delete"), productHandler.SetPrimaryImage)
				products.DELETE("/:id/images/:imageId", middleware.RequireAnyPermission(db, "product_image.upload", "product_image.delete"), productHandler.DeleteProductImage)
			}

			// Picking
			picking := protected.Group("/picking")
			{
				picking.POST("/upload-and-validate", middleware.RequirePermission(db, "picking_list.upload"), pickingHandler.UploadAndValidate)
				picking.GET("/pending-items", pickingHandler.GetPendingItems)
				picking.GET("/history-items", pickingHandler.GetHistoryItems)
				picking.GET("/:id", pickingHandler.GetPickingDetail)
				picking.POST("/complete-items", middleware.RequirePermission(db, "picking_list.confirm"), pickingHandler.CompleteItems)
				picking.POST("/void/:id", middleware.RequirePermission(db, "picking_list.void"), pickingHandler.VoidPickingList)
				picking.POST("/:id/retry-backorders", pickingHandler.RetryBackorders)
				picking.POST("/retry-backorders-batch", pickingHandler.RetryBackordersBatch)
			}

			// RBAC
			roles := protected.Group("/admin/roles", middleware.RequirePermission(db, "role.manage"))
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
			adminUsers := protected.Group("/admin/users", middleware.RequirePermission(db, "user.manage"))
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
			protected.GET("/logs", middleware.RequirePermission(db, "system_log.view"), systemLogHandler.GetLogs)

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
			protected.GET("/attendance/history", middleware.RequirePermission(db, "attendance.view_other"), attendanceHandler.GetHistory)
			protected.GET("/attendance/range", attendanceHandler.GetRangeData)
			protected.GET("/attendance/:year/:month", attendanceHandler.GetMonthlyData)
			protected.POST("/attendance/update", middleware.RequireAnyPermission(db, "attendance.manage", "attendance.edit_other"), attendanceHandler.UpdateLog)
			protected.POST("/attendance/upload", middleware.RequireAnyPermission(db, "attendance.manage", "attendance.edit_other"), attendanceHandler.UploadLogs)

			// System: Jobs
			protected.GET("/jobs/import", jobHandler.GetImportJobs)
			protected.DELETE("/jobs/import/:id", jobHandler.CancelImportJob)
			protected.GET("/jobs/export", jobHandler.GetExportJobs)
			protected.DELETE("/jobs/export/:id", jobHandler.CancelExportJob)

			statistics := protected.Group("/statistics")
			{
				statistics.GET("/stock-movements", statisticHandler.GetStockMovements)
				statistics.POST("/stock-movements/export", statisticHandler.RequestStockMovementsExport)
				statistics.GET("/stock-movements/:productId/breakdown", statisticHandler.GetStockBuildingBreakdown)
				statistics.GET("/inventory-value", middleware.RequirePermission(db, "statistic_finance.view"), statisticHandler.GetInventoryValue)
				statistics.GET("/stock-timeline", middleware.RequirePermission(db, "statistic_stock.view"), statisticHandler.GetStockTimeline)
				statistics.POST("/stock-timeline/export", statisticHandler.RequestStockTimelineExport)
				statistics.GET("/shop-performance", statisticHandler.GetShopPerformance)
				statistics.GET("/package-analysis", statisticHandler.GetPackageAnalysis)
				statistics.GET("/location-analysis", statisticHandler.GetLocationAnalysis)
				statistics.GET("/location-analysis/:id/details", statisticHandler.GetLocationCapacityDetails)
				statistics.POST("/location-analysis/export", statisticHandler.ExportLocationCapacity)
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
