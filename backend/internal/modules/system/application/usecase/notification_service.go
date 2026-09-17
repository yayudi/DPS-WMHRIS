package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/shared/database"

	system_mysql "github.com/dps-wmhris/backend/internal/modules/system/adapter/outbound/mysql"
)

// NotificationService handles notification business logic.
type NotificationService interface {
	FetchRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error)
	FetchAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error)
	MarkNotificationAsDone(ctx context.Context, notificationID int, userID int) error
	MarkAllNotificationsAsDone(ctx context.Context, userID int) error
	ClaimNotification(ctx context.Context, notificationID int, userID int) (bool, error)
	FetchPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error)
	UpdatePreferences(ctx context.Context, userID int, preferences []system_dto.NotificationPreference) error
	NotifyUsers(ctx context.Context, userIDs []int, notifType, title, message string, actionPayload interface{}, isDone bool) error
	NotifyUsersByPermission(ctx context.Context, permissionName, notifType, title, message string, actionPayload interface{}, excludeUserID *int, isDone bool) error
}

type notificationServiceImpl struct {
	txManager        database.TransactionManager
	notificationRepo system_mysql.NotificationRepository
	firebaseService  FirebaseSignalService
}

// NewNotificationService creates a new NotificationService.
func NewNotificationService(txManager database.TransactionManager, notificationRepo system_mysql.NotificationRepository, firebaseService FirebaseSignalService) NotificationService {
	return &notificationServiceImpl{
		txManager:        txManager,
		notificationRepo: notificationRepo,
		firebaseService:  firebaseService,
	}
}

// FetchRecentPending returns recent pending notifications for a user.
func (s *notificationServiceImpl) FetchRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error) {
	if limit <= 0 {
		limit = 5
	}
	return s.notificationRepo.GetRecentPending(ctx, userID, limit)
}

// FetchAll returns all notifications for a user, optionally filtered by type.
func (s *notificationServiceImpl) FetchAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error) {
	return s.notificationRepo.GetAll(ctx, userID, filterType)
}

// MarkNotificationAsDone marks a single notification as done within a transaction.
func (s *notificationServiceImpl) MarkNotificationAsDone(ctx context.Context, notificationID int, userID int) error {
	var affected int
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var txErr error
		affected, txErr = s.notificationRepo.MarkAsDone(ctx, notificationID, userID)
		return txErr
	})

	if err == nil && affected > 0 {
		_ = s.firebaseService.EmitUserSignal(context.Background(), fmt.Sprintf("%d", userID), "")
	}

	return err
}

// MarkAllNotificationsAsDone marks all pending notifications as done within a transaction.
func (s *notificationServiceImpl) MarkAllNotificationsAsDone(ctx context.Context, userID int) error {
	var affected int
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var txErr error
		affected, txErr = s.notificationRepo.MarkAllAsDone(ctx, userID)
		return txErr
	})

	if err == nil && affected > 0 {
		_ = s.firebaseService.EmitUserSignal(context.Background(), fmt.Sprintf("%d", userID), "")
	}

	return err
}

// ClaimNotification handles claiming a shared task notification.
func (s *notificationServiceImpl) ClaimNotification(ctx context.Context, notificationID int, userID int) (bool, error) {
	var affected int
	err := s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		var txErr error
		affected, txErr = s.notificationRepo.ClaimTask(ctx, notificationID, userID)
		return txErr
	})

	if err == nil && affected > 0 {
		_ = s.firebaseService.EmitUserSignal(context.Background(), fmt.Sprintf("%d", userID), "")
	}

	return affected > 0, err
}

// FetchPreferences returns notification preferences for a user, filling defaults.
func (s *notificationServiceImpl) FetchPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error) {
	prefs, err := s.notificationRepo.GetPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}

	defaultTypes := []string{"WMS", "HRIS", "SYSTEM"}
	result := make([]system_dto.NotificationPreference, 0, len(defaultTypes))
	for _, t := range defaultTypes {
		found := false
		for _, p := range prefs {
			if p.Type == t {
				result = append(result, p)
				found = true
				break
			}
		}
		if !found {
			result = append(result, system_dto.NotificationPreference{Type: t, IsEnabled: true})
		}
	}

	return result, nil
}

// UpdatePreferences updates notification preferences for a user within a transaction.
func (s *notificationServiceImpl) UpdatePreferences(ctx context.Context, userID int, preferences []system_dto.NotificationPreference) error {
	return s.txManager.WithTransaction(ctx, func(ctx context.Context) error {
		for _, pref := range preferences {
			if err := s.notificationRepo.UpsertPreference(ctx, userID, pref.Type, pref.IsEnabled); err != nil {
				return err
			}
		}
		return nil
	})
}

// NotifyUsers creates a personal notification for each user in the list.
func (s *notificationServiceImpl) NotifyUsers(ctx context.Context, userIDs []int, notifType, title, message string, actionPayload interface{}, isDone bool) error {
	if len(userIDs) == 0 {
		return nil
	}
	for _, uid := range userIDs {
		prefs, err := s.notificationRepo.GetPreferences(ctx, uid)
		if err != nil {
			log.Printf("[NOTIFICATION] Error fetching prefs for user %d: %v", uid, err)
			continue
		}

		isEnabled := true
		for _, p := range prefs {
			if p.Type == notifType {
				isEnabled = p.IsEnabled
				break
			}
		}

		if isEnabled {
			userID := uid
			payloadBytes, _ := json.Marshal(actionPayload)
			_, err := s.notificationRepo.CreateNotification(ctx, system_dto.CreateNotificationPayload{
				UserID:        &userID,
				Type:          notifType,
				Title:         title,
				Message:       message,
				ActionPayload: payloadBytes,
				IsDone:        isDone,
			})
			if err != nil {
				log.Printf("[NOTIFICATION] Error creating notification for user %d: %v", uid, err)
			} else {
				_ = s.firebaseService.EmitUserSignal(context.Background(), fmt.Sprintf("%d", uid), "")
			}
		}
	}
	return nil
}

// NotifyUsersByPermission creates a single shared-task notification visible to all users with the given permission.
func (s *notificationServiceImpl) NotifyUsersByPermission(ctx context.Context, permissionName, notifType, title, message string, actionPayload interface{}, excludeUserID *int, isDone bool) error {
	payloadBytes, _ := json.Marshal(actionPayload)

	_, err := s.notificationRepo.CreateNotification(ctx, system_dto.CreateNotificationPayload{
		UserID:           nil,
		Type:             notifType,
		Title:            title,
		Message:          message,
		ActionPayload:    payloadBytes,
		IsDone:           isDone,
		TargetPermission: &permissionName,
		ExcludeUserID:    excludeUserID,
	})

	if err == nil {
		_ = s.firebaseService.EmitSharedTaskSignal(context.Background(), permissionName, "")
	}

	return err
}
