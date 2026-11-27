// Package event implements RabbitMQ event listeners for the system module.
package event

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

// LogListener subscribes to system audit log events on the EventBus and persists them.
type LogListener struct {
	logService port.SystemLogService
}

// NewLogListener constructs a LogListener backed by SystemLogService.
func NewLogListener(logService port.SystemLogService) *LogListener {
	return &LogListener{
		logService: logService,
	}
}

// Register subscribes HandleSystemLog to domain.EventSystemLog on the given EventBus.
func (l *LogListener) Register(bus eventbus.EventBus) error {
	log.Printf("[LogListener] Registering for event: %s", domain.EventSystemLog)
	return bus.Subscribe(domain.EventSystemLog, l.HandleSystemLog)
}

// HandleSystemLog unmarshals and validates a system.log.created event and writes it to the audit log store.
func (l *LogListener) HandleSystemLog(ctx context.Context, evt eventbus.Event) error {
	var payload domain.SystemLogPayload
	if err := json.Unmarshal(evt.Payload, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal log payload: %w", err)
	}

	action := strings.TrimSpace(payload.Action)
	targetType := strings.TrimSpace(payload.TargetType)
	if action == "" || targetType == "" {
		return errors.New("invalid system log payload: action and target_type are required")
	}

	err := l.logService.CreateLog(ctx, system_dto.CreateLogRequest{
		UserID:     evt.UserID,
		Action:     action,
		TargetType: targetType,
		TargetID:   strings.TrimSpace(payload.TargetID),
		Changes:    payload.Changes,
		IP:         payload.IP,
		UserAgent:  payload.UserAgent,
	})
	if err != nil {
		return fmt.Errorf("failed to create log: %w", err)
	}

	return nil
}
