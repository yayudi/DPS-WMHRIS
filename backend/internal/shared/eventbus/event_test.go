package eventbus

import (
	"context"
	"encoding/json"
	"testing"
)

type mockBus struct {
	published []Event
	handlers  map[string]EventHandler
}

func newMockBus() *mockBus {
	return &mockBus{
		handlers: make(map[string]EventHandler),
	}
}

func (m *mockBus) Publish(ctx context.Context, event Event) error {
	m.published = append(m.published, event)
	return nil
}

func (m *mockBus) Subscribe(eventType string, handler EventHandler) error {
	m.handlers[eventType] = handler
	return nil
}

func (m *mockBus) Start(ctx context.Context) error { return nil }
func (m *mockBus) Close() error                    { return nil }

type samplePayload struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

func TestNewEvent_PayloadFormatting(t *testing.T) {
	evt := NewEvent("test.type", samplePayload{ID: 10, Name: "Item"}, 42)

	if evt.Type != "test.type" {
		t.Errorf("expected type test.type, got %s", evt.Type)
	}
	if evt.UserID != 42 {
		t.Errorf("expected userID 42, got %d", evt.UserID)
	}

	var parsed samplePayload
	if err := json.Unmarshal(evt.Payload, &parsed); err != nil {
		t.Fatalf("failed to unmarshal payload: %v", err)
	}
	if parsed.ID != 10 || parsed.Name != "Item" {
		t.Errorf("unexpected parsed payload: %+v", parsed)
	}
}

func TestSubscribeTyped(t *testing.T) {
	bus := newMockBus()
	ctx := context.Background()

	var received samplePayload
	var receivedEvent Event

	err := SubscribeTyped(bus, "sample.event", func(ctx context.Context, p samplePayload, evt Event) error {
		received = p
		receivedEvent = evt
		return nil
	})
	if err != nil {
		t.Fatalf("SubscribeTyped returned error: %v", err)
	}

	raw, _ := json.Marshal(samplePayload{ID: 99, Name: "Hello"})
	evt := Event{
		Type:    "sample.event",
		Payload: raw,
		UserID:  7,
	}

	handler := bus.handlers["sample.event"]
	if handler == nil {
		t.Fatal("handler was not registered")
	}

	if err := handler(ctx, evt); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	if received.ID != 99 || received.Name != "Hello" {
		t.Errorf("unexpected payload received: %+v", received)
	}
	if receivedEvent.UserID != 7 {
		t.Errorf("unexpected event received: %+v", receivedEvent)
	}
}

func TestSubscribePayload(t *testing.T) {
	bus := newMockBus()
	ctx := context.Background()

	var received samplePayload
	err := SubscribePayload(bus, "sample.event", func(ctx context.Context, p samplePayload) error {
		received = p
		return nil
	})
	if err != nil {
		t.Fatalf("SubscribePayload returned error: %v", err)
	}

	raw, _ := json.Marshal(samplePayload{ID: 100, Name: "Direct"})
	handler := bus.handlers["sample.event"]
	if err := handler(ctx, Event{Type: "sample.event", Payload: raw}); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	if received.ID != 100 || received.Name != "Direct" {
		t.Errorf("unexpected payload received: %+v", received)
	}
}

func TestPublishAuditLog(t *testing.T) {
	bus := newMockBus()
	ctx := context.Background()

	input := AuditLogInput{
		UserID:     12,
		Action:     "UPDATE",
		TargetType: "LOCATION",
		TargetID:   "5",
		Changes:    map[string]string{"name": "Rack-A"},
		IP:         "127.0.0.1",
		UserAgent:  "Mozilla/5.0",
	}

	if err := PublishAuditLog(ctx, bus, input); err != nil {
		t.Fatalf("PublishAuditLog returned error: %v", err)
	}

	if len(bus.published) != 1 {
		t.Fatalf("expected 1 published event, got %d", len(bus.published))
	}

	evt := bus.published[0]
	if evt.Type != EventSystemLog {
		t.Errorf("expected event type %s, got %s", EventSystemLog, evt.Type)
	}
	if evt.UserID != 12 {
		t.Errorf("expected user ID 12, got %d", evt.UserID)
	}

	var data struct {
		Action     string  `json:"action"`
		TargetType string  `json:"target_type"`
		TargetID   string  `json:"target_id"`
		Changes    *string `json:"changes"`
		IP         *string `json:"ip"`
		UserAgent  *string `json:"user_agent"`
	}

	if err := json.Unmarshal(evt.Payload, &data); err != nil {
		t.Fatalf("failed to unmarshal published payload: %v", err)
	}

	if data.Action != "UPDATE" || data.TargetType != "LOCATION" || data.TargetID != "5" {
		t.Errorf("unexpected data fields: %+v", data)
	}
	if data.IP == nil || *data.IP != "127.0.0.1" {
		t.Errorf("unexpected IP: %v", data.IP)
	}
	if data.Changes == nil || *data.Changes != `{"name":"Rack-A"}` {
		t.Errorf("unexpected Changes: %v", data.Changes)
	}
}

func TestPublishAuditLog_NilBus(t *testing.T) {
	ctx := context.Background()
	err := PublishAuditLog(ctx, nil, AuditLogInput{})
	if err != nil {
		t.Errorf("expected nil error on nil bus, got %v", err)
	}
}
