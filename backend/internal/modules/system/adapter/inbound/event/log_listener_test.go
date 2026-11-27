package event_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/dps-wmhris/backend/internal/modules/system/adapter/inbound/event"
	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type mockLogService struct {
	created []system_dto.CreateLogRequest
}

func (m *mockLogService) CreateLog(ctx context.Context, req system_dto.CreateLogRequest) error {
	m.created = append(m.created, req)
	return nil
}
func (m *mockLogService) GetLogs(ctx context.Context, req system_dto.GetSystemLogsRequest) (*system_dto.GetSystemLogsResponse, error) {
	return nil, nil
}

type stubEventBus struct {
	subscribed []string
}

func (s *stubEventBus) Publish(ctx context.Context, evt eventbus.Event) error { return nil }
func (s *stubEventBus) Subscribe(eventType string, handler eventbus.EventHandler) error {
	s.subscribed = append(s.subscribed, eventType)
	return nil
}
func (s *stubEventBus) Start(ctx context.Context) error { return nil }
func (s *stubEventBus) Close() error                    { return nil }

func TestLogListener_RegisterAndHandleSystemLog(t *testing.T) {
	svc := &mockLogService{}
	listener := event.NewLogListener(svc)
	bus := &stubEventBus{}

	if err := listener.Register(bus); err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if len(bus.subscribed) != 1 || bus.subscribed[0] != domain.EventSystemLog {
		t.Fatalf("expected subscription to %s, got %+v", domain.EventSystemLog, bus.subscribed)
	}

	// 1. Valid event persists audit log
	payload, _ := json.Marshal(domain.SystemLogPayload{
		Action:     "UPDATE",
		TargetType: "USER",
		TargetID:   "7",
	})
	if err := listener.HandleSystemLog(context.Background(), eventbus.Event{UserID: 1, Payload: payload}); err != nil {
		t.Fatalf("HandleSystemLog failed: %v", err)
	}
	if len(svc.created) != 1 || svc.created[0].Action != "UPDATE" || svc.created[0].UserID != 1 {
		t.Fatalf("unexpected persisted log: %+v", svc.created)
	}

	// 2. Malformed JSON returns error
	if err := listener.HandleSystemLog(context.Background(), eventbus.Event{UserID: 1, Payload: []byte("{bad")}); err == nil {
		t.Fatalf("expected error on malformed JSON")
	}

	// 3. Missing action/target_type returns error
	emptyPayload, _ := json.Marshal(domain.SystemLogPayload{Action: "", TargetType: "USER"})
	if err := listener.HandleSystemLog(context.Background(), eventbus.Event{UserID: 1, Payload: emptyPayload}); err == nil {
		t.Fatalf("expected validation error on empty action")
	}
}
