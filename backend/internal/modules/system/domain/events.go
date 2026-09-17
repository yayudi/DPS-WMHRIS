package domain

// Event Types
const (
	EventSystemLog = "system.log.created"
)

// SystemLogPayload represents the data for a SystemLogEvent.
type SystemLogPayload struct {
	Action     string  `json:"action"`
	TargetType string  `json:"target_type"`
	TargetID   string  `json:"target_id"`
	Changes    *string `json:"changes,omitempty"`
	IP         *string `json:"ip,omitempty"`
	UserAgent  *string `json:"user_agent,omitempty"`
}
