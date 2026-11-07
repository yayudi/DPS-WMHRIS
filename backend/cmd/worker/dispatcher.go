package main

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/database"
)

// dispatchConfig defines concurrency and timeout parameters for job dispatching.
type dispatchConfig struct {
	Concurrency int
	JobTimeout  time.Duration
	Name        string
}

// dispatchJobs claims and processes jobs concurrently with a semaphore limit.
// The claim operation runs inside a short-lived transaction managed by txManager,
// ensuring FOR UPDATE SKIP LOCKED locks are held properly and committed immediately.
func dispatchJobs[J any](
	ctx context.Context,
	txManager database.TransactionManager,
	cfg dispatchConfig,
	claim func(ctx context.Context) (*J, error),
	process func(ctx context.Context, job *J) error,
) {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = maxConcurrentJobs
	}
	if cfg.JobTimeout <= 0 {
		cfg.JobTimeout = 10 * time.Minute
	}

	sem := make(chan struct{}, cfg.Concurrency)
	var wg sync.WaitGroup

	for {
		if ctx.Err() != nil {
			break
		}

		select {
		case <-ctx.Done():
			wg.Wait()
			return
		case sem <- struct{}{}:
		}

		if ctx.Err() != nil {
			<-sem
			break
		}

		var job *J
		claimErr := txManager.WithTransaction(ctx, func(txCtx context.Context) error {
			var err error
			job, err = claim(txCtx)
			return err
		})

		if claimErr != nil {
			log.Printf("[%s] Error claiming job: %v", cfg.Name, claimErr)
			<-sem
			break
		}

		if job == nil {
			// No more pending jobs
			<-sem
			break
		}

		wg.Add(1)
		go func(targetJob *J) {
			defer wg.Done()
			defer func() { <-sem }()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[%s] CRITICAL: Unhandled panic recovered in worker goroutine: %v", cfg.Name, r)
				}
			}()

			if ctx.Err() != nil {
				return
			}

			jobCtx, cancel := context.WithTimeout(ctx, cfg.JobTimeout)
			defer cancel()

			if err := process(jobCtx, targetJob); err != nil {
				log.Printf("[%s] Job execution error: %v", cfg.Name, err)
			}
		}(job)
	}

	wg.Wait()
}
