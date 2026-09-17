package event

import (
	"context"
	"log"
	"sync"
)

// Event represents a generic domain event
type Event interface {
	Name() string
	Payload() interface{}
}

// EventHandler is a function that handles an event
type EventHandler func(ctx context.Context, e Event) error

// Publisher defines the interface for publishing events
type Publisher interface {
	Publish(ctx context.Context, e Event) error
}

// Subscriber defines the interface for subscribing to events
type Subscriber interface {
	Subscribe(eventName string, handler EventHandler)
}

// Bus defines the full interface for an event bus
type Bus interface {
	Publisher
	Subscriber
	Start(ctx context.Context)
	Stop()
}

type eventMessage struct {
	ctx   context.Context
	event Event
}

// InMemoryBus is an asynchronous in-memory event bus using Go channels
type InMemoryBus struct {
	mu       sync.RWMutex
	handlers map[string][]EventHandler
	eventCh  chan eventMessage
	wg       sync.WaitGroup
	quit     chan struct{}
}

// NewInMemoryBus creates a new InMemoryBus with the specified channel buffer size
func NewInMemoryBus(bufferSize int) *InMemoryBus {
	return &InMemoryBus{
		handlers: make(map[string][]EventHandler),
		eventCh:  make(chan eventMessage, bufferSize),
		quit:     make(chan struct{}),
	}
}

// Publish sends an event to the channel asynchronously.
// It blocks if the buffer is full until space is available or the context is canceled.
func (b *InMemoryBus) Publish(ctx context.Context, e Event) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case b.eventCh <- eventMessage{ctx: ctx, event: e}:
		return nil
	}
}

// Subscribe registers a handler for a specific event name
func (b *InMemoryBus) Subscribe(eventName string, handler EventHandler) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.handlers[eventName] = append(b.handlers[eventName], handler)
}

// Start begins listening for events on the channel in a background goroutine
func (b *InMemoryBus) Start(ctx context.Context) {
	b.wg.Add(1)
	go func() {
		defer b.wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case <-b.quit:
				return
			case msg := <-b.eventCh:
				b.mu.RLock()
				handlers, ok := b.handlers[msg.event.Name()]
				b.mu.RUnlock()

				if !ok {
					continue
				}

				for _, handler := range handlers {
					// We execute each handler.
					// Errors are simply logged as this is an async background process.
					if err := handler(msg.ctx, msg.event); err != nil {
						log.Printf("[EventBus] Error handling event %s: %v", msg.event.Name(), err)
					}
				}
			}
		}
	}()
}

// Stop signals the background worker to stop and waits for it to finish
func (b *InMemoryBus) Stop() {
	close(b.quit)
	b.wg.Wait()
}
