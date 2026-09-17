package event

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type LogListener struct {
	logService usecase.SystemLogService
}

func NewLogListener(logService usecase.SystemLogService) *LogListener {
	return &LogListener{
		logService: logService,
	}
}

func (l *LogListener) Register(bus eventbus.EventBus) error {
	log.Printf("[LogListener] Registering for event: %s", domain.EventSystemLog)
	return bus.Subscribe(domain.EventSystemLog, l.HandleSystemLog)
}

func (l *LogListener) HandleSystemLog(ctx context.Context, event eventbus.Event) error {
	// Re-marshal map[string]interface{} to JSON and then to SystemLogPayload
	// Since event.Payload comes from JSON unmarshaling, it's a map.
	payloadBytes, err := json.Marshal(event.Payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	var payload domain.SystemLogPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	// Create the log entry
	err = l.logService.CreateLog(ctx, system_dto.CreateLogRequest{
		UserID:     event.UserID,
		Action:     payload.Action,
		TargetType: payload.TargetType,
		TargetID:   payload.TargetID,
		Changes:    payload.Changes,
		IP:         payload.IP,
		UserAgent:  payload.UserAgent,
	})

	if err != nil {
		return fmt.Errorf("failed to create log: %w", err)
	}

	return nil
}
