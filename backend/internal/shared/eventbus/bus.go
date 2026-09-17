package eventbus

import "context"

// EventHandler defines a function signature that processes an event.
type EventHandler func(ctx context.Context, event Event) error

// EventBus is the interface for publishing and subscribing to domain events.
type EventBus interface {
	Publish(ctx context.Context, event Event) error
	Subscribe(eventType string, handler EventHandler) error
	Start(ctx context.Context) error
	Close() error
}
