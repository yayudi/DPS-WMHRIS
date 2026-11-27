// Package domain defines core entities, value objects, event payloads, and custom errors for the system module.
package domain

// EventSystemLog is the RabbitMQ routing key for asynchronous system audit log events.
const (
	EventSystemLog = "system.log.created"
)

// SystemLogPayload represents the JSON payload carried by a SystemLogEvent.
type SystemLogPayload struct {
	Action     string  `json:"action"`
	TargetType string  `json:"target_type"`
	TargetID   string  `json:"target_id"`
	Changes    *string `json:"changes,omitempty"`
	IP         *string `json:"ip,omitempty"`
	UserAgent  *string `json:"user_agent,omitempty"`
}
