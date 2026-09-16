package event

import (
	"context"
	"sync"
)

// Event represents a generic domain event
type Event interface {
	Name() string
	Payload() interface{}
}

// EventHandler is a function that handles an event
type EventHandler func(ctx context.Context, e Event) error

// Bus defines the interface for publishing and subscribing to events
type Bus interface {
	Publish(ctx context.Context, e Event) error
	Subscribe(eventName string, handler EventHandler)
}

// InMemoryBus is a simple, synchronous in-memory event bus implementation
type InMemoryBus struct {
	mu       sync.RWMutex
	handlers map[string][]EventHandler
}

func NewInMemoryBus() *InMemoryBus {
	return &InMemoryBus{
		handlers: make(map[string][]EventHandler),
	}
}

func (b *InMemoryBus) Publish(ctx context.Context, e Event) error {
	b.mu.RLock()
	defer b.mu.RUnlock()

	handlers, ok := b.handlers[e.Name()]
	if !ok {
		return nil // No handlers for this event
	}

	for _, handler := range handlers {
		// In a production system, this could be dispatched to a goroutine
		// but synchronous is fine for our modular monolith start
		if err := handler(ctx, e); err != nil {
			return err
		}
	}
	return nil
}

func (b *InMemoryBus) Subscribe(eventName string, handler EventHandler) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.handlers[eventName] = append(b.handlers[eventName], handler)
}
