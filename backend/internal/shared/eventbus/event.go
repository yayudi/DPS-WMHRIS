package eventbus

import "time"

// Event represents a generic domain event.
type Event struct {
	Type       string
	Payload    interface{}
	UserID     int
	OccurredAt time.Time
}

// NewEvent is a helper to construct a domain event.
func NewEvent(eventType string, payload interface{}, userID int) Event {
	return Event{
		Type:       eventType,
		Payload:    payload,
		UserID:     userID,
		OccurredAt: time.Now(),
	}
}
