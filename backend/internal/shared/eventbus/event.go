package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Event represents a domain event transported via the EventBus.
type Event struct {
	Type       string          `json:"Type"`
	Payload    json.RawMessage `json:"Payload"`
	UserID     int             `json:"UserID"`
	OccurredAt time.Time       `json:"OccurredAt"`
}

// NewEvent constructs an Event, serializing the payload into json.RawMessage if not already formatted.
func NewEvent(eventType string, payload interface{}, userID int) Event {
	var raw json.RawMessage
	switch p := payload.(type) {
	case json.RawMessage:
		raw = p
	case []byte:
		raw = p
	default:
		if b, err := json.Marshal(payload); err == nil {
			raw = b
		} else {
			raw = []byte("{}")
		}
	}

	return Event{
		Type:       eventType,
		Payload:    raw,
		UserID:     userID,
		OccurredAt: time.Now(),
	}
}

// TypedEventHandler handles an event with an unmarshaled, typed payload and access to raw event metadata.
type TypedEventHandler[T any] func(ctx context.Context, payload T, event Event) error

// SubscribeTyped registers a strongly-typed event handler that receives payload of type T along with event metadata.
func SubscribeTyped[T any](bus EventBus, eventType string, handler TypedEventHandler[T]) error {
	return bus.Subscribe(eventType, func(ctx context.Context, event Event) error {
		var payload T
		if len(event.Payload) > 0 {
			if err := json.Unmarshal(event.Payload, &payload); err != nil {
				return fmt.Errorf("failed to unmarshal event %s payload: %w", eventType, err)
			}
		}
		return handler(ctx, payload, event)
	})
}

// SubscribePayload registers a handler that only consumes the strongly-typed payload T.
func SubscribePayload[T any](bus EventBus, eventType string, handler func(ctx context.Context, payload T) error) error {
	return SubscribeTyped[T](bus, eventType, func(ctx context.Context, payload T, _ Event) error {
		return handler(ctx, payload)
	})
}

// AuditLogInput specifies the parameters for publishing a standardized system audit log.
type AuditLogInput struct {
	UserID     int
	Action     string
	TargetType string
	TargetID   string
	Changes    any
	IP         string
	UserAgent  string
}

// EventSystemLog is the canonical topic for system audit log events.
const EventSystemLog = "system.log.created"

// PublishAuditLog formats and publishes an audit log event asynchronously.
func PublishAuditLog(ctx context.Context, bus EventBus, input AuditLogInput) error {
	if bus == nil {
		return nil
	}

	var changesStr *string
	if input.Changes != nil {
		switch c := input.Changes.(type) {
		case string:
			if c != "" {
				changesStr = &c
			}
		case *string:
			changesStr = c
		default:
			if b, err := json.Marshal(c); err == nil && string(b) != "null" {
				s := string(b)
				changesStr = &s
			}
		}
	}

	var ipPtr *string
	if input.IP != "" {
		ipPtr = &input.IP
	}

	var uaPtr *string
	if input.UserAgent != "" {
		uaPtr = &input.UserAgent
	}

	payload := struct {
		Action     string  `json:"action"`
		TargetType string  `json:"target_type"`
		TargetID   string  `json:"target_id"`
		Changes    *string `json:"changes,omitempty"`
		IP         *string `json:"ip,omitempty"`
		UserAgent  *string `json:"user_agent,omitempty"`
	}{
		Action:     input.Action,
		TargetType: input.TargetType,
		TargetID:   input.TargetID,
		Changes:    changesStr,
		IP:         ipPtr,
		UserAgent:  uaPtr,
	}

	return bus.Publish(ctx, NewEvent(EventSystemLog, payload, input.UserID))
}
