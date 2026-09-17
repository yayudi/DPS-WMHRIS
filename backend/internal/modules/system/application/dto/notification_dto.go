package system_dto

import "encoding/json"

// NotificationResponse represents a single notification row returned to the frontend.
type NotificationResponse struct {
	ID              int              `json:"id" db:"id"`
	Type            string           `json:"type" db:"type"`
	Title           string           `json:"title" db:"title"`
	Message         string           `json:"message" db:"message"`
	ActionPayload   *json.RawMessage `json:"action_payload" db:"action_payload"`
	IsDone          bool             `json:"is_done" db:"is_done"`
	CreatedAt       string           `json:"created_at" db:"created_at"`
	ClaimedBy       *int             `json:"claimed_by" db:"claimed_by"`
	ClaimedAt       *string          `json:"claimed_at" db:"claimed_at"`
	ClaimedByName   *string          `json:"claimed_by_name,omitempty" db:"claimed_by_name"`
	CompletedAt     *string          `json:"completed_at,omitempty" db:"completed_at"`
	CompletedByName *string          `json:"completed_by_name,omitempty" db:"completed_by_name"`
}

// NotificationPreference represents a user's notification preference for a type.
type NotificationPreference struct {
	Type      string `json:"type" db:"type"`
	IsEnabled bool   `json:"is_enabled" db:"is_enabled"`
}

// UpdatePreferencesRequest is the body for PUT /notifications/preferences.
type UpdatePreferencesRequest struct {
	Preferences []NotificationPreference `json:"preferences" binding:"required"`
}

// CreateNotificationPayload is used internally by services to create a notification.
type CreateNotificationPayload struct {
	UserID           *int        `json:"user_id"`
	Type             string      `json:"type"`
	Title            string      `json:"title"`
	Message          string      `json:"message"`
	ActionPayload    interface{} `json:"action_payload"`
	IsDone           bool        `json:"is_done"`
	TargetPermission *string     `json:"target_permission"`
	ExcludeUserID    *int        `json:"exclude_user_id"`
}
