package main

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type mockTxManager struct {
	withTxFunc func(ctx context.Context, fn func(ctx context.Context) error) error
}

func (m *mockTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	if m.withTxFunc != nil {
		return m.withTxFunc(ctx, fn)
	}
	return fn(ctx)
}

type dummyJob struct {
	ID   int
	Name string
}

func TestDispatchJobs_NilClaim_NoProcess(t *testing.T) {
	ctx := context.Background()
	txManager := &mockTxManager{}
	cfg := dispatchConfig{
		Concurrency: 2,
		JobTimeout:  time.Second,
		Name:        "test-nil",
	}

	claimCalls := 0
	claim := func(ctx context.Context) (*dummyJob, error) {
		claimCalls++
		return nil, nil // No jobs pending
	}

	processCalls := 0
	process := func(ctx context.Context, job *dummyJob) error {
		processCalls++
		return nil
	}

	dispatchJobs(ctx, txManager, cfg, claim, process)

	if claimCalls != 1 {
		t.Errorf("expected 1 claim call, got %d", claimCalls)
	}
	if processCalls != 0 {
		t.Errorf("expected 0 process calls when claim returns nil, got %d", processCalls)
	}
}

func TestDispatchJobs_ClaimError_StopsDispatch(t *testing.T) {
	ctx := context.Background()
	txManager := &mockTxManager{}
	cfg := dispatchConfig{
		Concurrency: 2,
		JobTimeout:  time.Second,
		Name:        "test-claim-err",
	}

	claimErr := errors.New("database connection refused")
	claim := func(ctx context.Context) (*dummyJob, error) {
		return nil, claimErr
	}

	processCalls := 0
	process := func(ctx context.Context, job *dummyJob) error {
		processCalls++
		return nil
	}

	dispatchJobs(ctx, txManager, cfg, claim, process)

	if processCalls != 0 {
		t.Errorf("expected 0 process calls on claim error, got %d", processCalls)
	}
}

func TestDispatchJobs_ProcessErrorDoesNotStopOthers(t *testing.T) {
	ctx := context.Background()
	txManager := &mockTxManager{}
	cfg := dispatchConfig{
		Concurrency: 2,
		JobTimeout:  time.Second,
		Name:        "test-resilient",
	}

	jobs := []*dummyJob{
		{ID: 1, Name: "failing-job"},
		{ID: 2, Name: "successful-job-1"},
		{ID: 3, Name: "successful-job-2"},
	}

	idx := 0
	var mu sync.Mutex
	claim := func(ctx context.Context) (*dummyJob, error) {
		mu.Lock()
		defer mu.Unlock()
		if idx < len(jobs) {
			j := jobs[idx]
			idx++
			return j, nil
		}
		return nil, nil
	}

	processedJobs := make([]int, 0, len(jobs))
	var procMu sync.Mutex
	process := func(ctx context.Context, job *dummyJob) error {
		procMu.Lock()
		processedJobs = append(processedJobs, job.ID)
		procMu.Unlock()

		if job.ID == 1 {
			return errors.New("simulated job failure")
		}
		return nil
	}

	dispatchJobs(ctx, txManager, cfg, claim, process)

	procMu.Lock()
	defer procMu.Unlock()
	if len(processedJobs) != 3 {
		t.Fatalf("expected 3 jobs to be processed, got %d", len(processedJobs))
	}
}

func TestDispatchJobs_ConcurrencyLimit(t *testing.T) {
	ctx := context.Background()
	txManager := &mockTxManager{}
	limit := 2
	cfg := dispatchConfig{
		Concurrency: limit,
		JobTimeout:  2 * time.Second,
		Name:        "test-concurrency",
	}

	totalJobs := 6
	jobCh := make(chan *dummyJob, totalJobs)
	for i := 1; i <= totalJobs; i++ {
		jobCh <- &dummyJob{ID: i, Name: "load"}
	}
	close(jobCh)

	claim := func(ctx context.Context) (*dummyJob, error) {
		j, ok := <-jobCh
		if !ok {
			return nil, nil
		}
		return j, nil
	}

	var active int32
	var maxActive int32
	var completed int32

	process := func(ctx context.Context, job *dummyJob) error {
		cur := atomic.AddInt32(&active, 1)

		// Record maximum active concurrency
		for {
			oldMax := atomic.LoadInt32(&maxActive)
			if cur <= oldMax {
				break
			}
			if atomic.CompareAndSwapInt32(&maxActive, oldMax, cur) {
				break
			}
		}

		time.Sleep(30 * time.Millisecond)
		atomic.AddInt32(&active, -1)
		atomic.AddInt32(&completed, 1)
		return nil
	}

	dispatchJobs(ctx, txManager, cfg, claim, process)

	if atomic.LoadInt32(&completed) != int32(totalJobs) {
		t.Errorf("expected %d completed jobs, got %d", totalJobs, completed)
	}
	if maxActive > int32(limit) {
		t.Errorf("concurrency exceeded limit: max observed %d, limit %d", maxActive, limit)
	}
}

func TestDispatchJobs_ContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	txManager := &mockTxManager{}
	cfg := dispatchConfig{
		Concurrency: 2,
		JobTimeout:  time.Second,
		Name:        "test-cancel",
	}

	claimCalls := 0
	claim := func(ctx context.Context) (*dummyJob, error) {
		claimCalls++
		return &dummyJob{ID: 1}, nil
	}

	processCalls := 0
	process := func(ctx context.Context, job *dummyJob) error {
		processCalls++
		return nil
	}

	dispatchJobs(ctx, txManager, cfg, claim, process)

	if processCalls != 0 {
		t.Errorf("expected 0 process calls on canceled context, got %d", processCalls)
	}
}
