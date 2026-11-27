package eventbus

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type fakeAMQPPublisher struct {
	mu            sync.Mutex
	closed        bool
	activeCalls   int32
	maxConcurrent int32
	published     []amqp.Publishing
}

func (f *fakeAMQPPublisher) IsClosed() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.closed
}

func (f *fakeAMQPPublisher) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}

func (f *fakeAMQPPublisher) PublishWithContext(ctx context.Context, exchange, key string, mandatory, immediate bool, msg amqp.Publishing) error {
	cur := atomic.AddInt32(&f.activeCalls, 1)
	for {
		old := atomic.LoadInt32(&f.maxConcurrent)
		if cur <= old || atomic.CompareAndSwapInt32(&f.maxConcurrent, old, cur) {
			break
		}
	}
	time.Sleep(2 * time.Millisecond)
	atomic.AddInt32(&f.activeCalls, -1)

	f.mu.Lock()
	f.published = append(f.published, msg)
	f.mu.Unlock()
	return nil
}

func TestGetRetryCount(t *testing.T) {
	tests := []struct {
		name     string
		headers  amqp.Table
		expected int
	}{
		{
			name:     "Nil headers",
			headers:  nil,
			expected: 0,
		},
		{
			name:     "Missing retry count header",
			headers:  amqp.Table{"other-header": "test"},
			expected: 0,
		},
		{
			name:     "Int retry count",
			headers:  amqp.Table{"x-retry-count": 2},
			expected: 2,
		},
		{
			name:     "Int32 retry count",
			headers:  amqp.Table{"x-retry-count": int32(3)},
			expected: 3,
		},
		{
			name:     "Int64 retry count",
			headers:  amqp.Table{"x-retry-count": int64(4)},
			expected: 4,
		},
		{
			name:     "Float64 retry count",
			headers:  amqp.Table{"x-retry-count": float64(5)},
			expected: 5,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := getRetryCount(tc.headers)
			if got != tc.expected {
				t.Errorf("getRetryCount() = %d, expected %d", got, tc.expected)
			}
		})
	}
}

func TestRabbitMQEventBus_ConcurrentPublishAndLazyReconnect(t *testing.T) {
	pub := &fakeAMQPPublisher{closed: true}
	var reconnectCalls int32

	bus := &rabbitMQEventBus{
		pubChannel: pub,
		handlers:   make(map[string]EventHandler),
	}
	bus.connectFunc = func() error {
		atomic.AddInt32(&reconnectCalls, 1)
		pub.mu.Lock()
		pub.closed = false
		pub.mu.Unlock()
		return nil
	}

	const goroutines = 8
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(id int) {
			defer wg.Done()
			err := bus.Publish(context.Background(), NewEvent("inventory.stock.updated", map[string]any{"id": id}, 1))
			if err != nil {
				t.Errorf("Publish failed: %v", err)
			}
		}(i)
	}
	wg.Wait()

	if got := atomic.LoadInt32(&reconnectCalls); got != 1 {
		t.Errorf("expected exactly 1 lazy reconnect when channel started closed, got %d", got)
	}
	if maxC := atomic.LoadInt32(&pub.maxConcurrent); maxC > 1 {
		t.Errorf("expected PublishWithContext calls to be serialized (maxConcurrent=1), observed %d", maxC)
	}
	if len(pub.published) != goroutines {
		t.Errorf("expected %d published messages, got %d", goroutines, len(pub.published))
	}
}

func TestRabbitMQEventBus_RepublishWithDelayFlushesOnShutdownBeforeClose(t *testing.T) {
	pub := &fakeAMQPPublisher{}
	bus := &rabbitMQEventBus{
		pubChannel: pub,
		handlers:   make(map[string]EventHandler),
	}

	ctx, cancel := context.WithCancel(context.Background())

	// Schedule retry 3 (which would normally sleep 4 seconds), then immediately cancel ctx and close bus
	bus.retryWg.Add(1)
	go bus.republishWithDelay(ctx, NewEvent("inventory.stock.decreased", map[string]any{"order_id": "ORD-1"}, 1), amqp.Table{"trace": "abc"}, 3)

	time.Sleep(15 * time.Millisecond)
	cancel()

	if err := bus.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}

	pub.mu.Lock()
	defer pub.mu.Unlock()
	if len(pub.published) != 1 {
		t.Fatalf("expected retry message to be flushed before Close(), got %d published messages", len(pub.published))
	}
	if got := getRetryCount(pub.published[0].Headers); got != 3 {
		t.Errorf("expected x-retry-count=3, got %d", got)
	}
	if pub.published[0].Headers["trace"] != "abc" {
		t.Errorf("expected original header preserved, got %+v", pub.published[0].Headers)
	}
}
