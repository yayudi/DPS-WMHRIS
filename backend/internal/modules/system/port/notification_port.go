package port

import (
	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
)

// NotificationRepository defines outbound persistence operations for user and shared-task notifications.
type NotificationRepository interface {
	GetRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error)
	GetAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error)
	MarkAsDone(ctx context.Context, notificationID int, userID int) (int, error)
	MarkAllAsDone(ctx context.Context, userID int) (int, error)
	ClaimTask(ctx context.Context, notificationID int, userID int) (int, error)
	GetPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error)
	UpsertPreference(ctx context.Context, userID int, notifType string, isEnabled bool) error
	CreateNotification(ctx context.Context, payload system_dto.CreateNotificationPayload) (int, error)
}

// NotificationService defines inbound application operations for notification delivery and user preferences.
type NotificationService interface {
	FetchRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error)
	FetchAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error)
	MarkNotificationAsDone(ctx context.Context, notificationID int, userID int) error
	MarkAllNotificationsAsDone(ctx context.Context, userID int) error
	ClaimNotification(ctx context.Context, notificationID int, userID int) (bool, error)
	FetchPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error)
	UpdatePreferences(ctx context.Context, userID int, preferences []system_dto.NotificationPreference) error
	NotifyUsers(ctx context.Context, userIDs []int, notifType, title, message string, actionPayload any, isDone bool) error
	NotifyUsersByPermission(ctx context.Context, permissionName, notifType, title, message string, actionPayload any, excludeUserID *int, isDone bool) error
}
