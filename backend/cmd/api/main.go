package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/config"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/middleware"
	"github.com/gin-gonic/gin"
)

const (
	serverReadHeaderTimeout = 10 * time.Second
	serverReadTimeout       = 60 * time.Second
	serverWriteTimeout      = 120 * time.Second
	serverIdleTimeout       = 120 * time.Second
	serverShutdownTimeout   = 15 * time.Second
)

func main() {
	// 1. Load Configurations & External Clients before DI wiring
	config.LoadConfig()
	config.InitFirebase()
	if err := config.InitR2(); err != nil {
		log.Printf("Failed to init R2: %v", err)
	}

	// 2. Setup Database Connection
	db := database.ConnectDB()
	defer func() {
		if err := db.Close(); err != nil {
			log.Printf("Error closing database connection: %v", err)
		}
	}()

	// 3. Configure Gin Mode
	if config.AppConfig.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 4. Setup Dependencies via Wire
	container, err := InitializeAPI(db)
	if err != nil {
		log.Fatalf("failed to initialize api: %v", err)
	}
	defer func() {
		if container.EventBus != nil {
			if err := container.EventBus.Close(); err != nil {
				log.Printf("Error closing EventBus connection: %v", err)
			}
		}
	}()

	// 5. Setup Router & Global Middlewares
	r := gin.Default()
	_ = r.SetTrustedProxies(nil)
	r.Use(middleware.GlobalErrorHandler())
	r.Use(middleware.RateLimiter(10, 20))
	r.Use(middleware.CORSMiddleware(config.AppConfig.CORSAllowedOrigins, config.AppConfig.Env))
	r.Use(middleware.LocaleContextMiddleware())

	registerRoutes(r, db, container)

	// 6. Start HTTP Server with explicit timeouts and graceful shutdown
	srv := &http.Server{
		Addr:              ":" + config.AppConfig.Port,
		Handler:           r,
		ReadHeaderTimeout: serverReadHeaderTimeout,
		ReadTimeout:       serverReadTimeout,
		WriteTimeout:      serverWriteTimeout,
		IdleTimeout:       serverIdleTimeout,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		log.Printf("Server is running on port %s", config.AppConfig.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		log.Printf("Server failed to start: %v", err)
		return
	case <-ctx.Done():
		log.Println("Shutdown signal received, draining active HTTP connections...")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP server forced to shutdown: %v", err)
	} else {
		log.Println("HTTP server exited cleanly")
	}
}
