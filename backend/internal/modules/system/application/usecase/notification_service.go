// Package usecase implements application use cases for the system module.
package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
)

const firebaseSignalTimeout = 5 * time.Second

// NotificationService aliases the hexagonal inbound port for backward compatibility.
type NotificationService = port.NotificationService

type notificationServiceImpl struct {
	txManager        database.TransactionManager
	notificationRepo port.NotificationRepository
	firebaseService  port.FirebaseSignalService
}

// NewNotificationService creates a new NotificationService.
func NewNotificationService(txManager database.TransactionManager, notificationRepo port.NotificationRepository, firebaseService port.FirebaseSignalService) port.NotificationService {
	return &notificationServiceImpl{
		txManager:        txManager,
		notificationRepo: notificationRepo,
		firebaseService:  firebaseService,
	}
}

func (s *notificationServiceImpl) emitUserSignalDetached(ctx context.Context, userID int) {
	if s.firebaseService == nil {
		return
	}
	signalCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), firebaseSignalTimeout)
	defer cancel()
	_ = s.firebaseService.EmitUserSignal(signalCtx, fmt.Sprintf("%d", userID), "")
}

func (s *notificationServiceImpl) emitSharedTaskSignalDetached(ctx context.Context, permissionName string) {
	if s.firebaseService == nil {
		return
	}
	signalCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), firebaseSignalTimeout)
	defer cancel()
	_ = s.firebaseService.EmitSharedTaskSignal(signalCtx, permissionName, "")
}

// FetchRecentPending returns recent pending notifications for a user, resolving _i18n metadata based on context locale.
func (s *notificationServiceImpl) FetchRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error) {
	if limit <= 0 {
		limit = 5
	}
	notifs, err := s.notificationRepo.GetRecentPending(ctx, userID, limit)
	if err != nil {
		return nil, err
	}
	return s.localizeNotifications(ctx, notifs), nil
}

// FetchAll returns all notifications for a user, optionally filtered by type, resolving _i18n metadata.
func (s *notificationServiceImpl) FetchAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error) {
	notifs, err := s.notificationRepo.GetAll(ctx, userID, filterType)
	if err != nil {
		return nil, err
	}
	return s.localizeNotifications(ctx, notifs), nil
}

func (s *notificationServiceImpl) localizeNotifications(ctx context.Context, notifs []system_dto.NotificationResponse) []system_dto.NotificationResponse {
	for i := range notifs {
		if notifs[i].ActionPayload == nil || len(*notifs[i].ActionPayload) == 0 {
			continue
		}
		var meta struct {
			I18n *system_dto.NotificationI18nMeta `json:"_i18n"`
		}
		if err := json.Unmarshal(*notifs[i].ActionPayload, &meta); err == nil && meta.I18n != nil {
			if meta.I18n.TitleKey != "" {
				translatedTitle := i18n.T(ctx, meta.I18n.TitleKey, meta.I18n.Params)
				if translatedTitle != meta.I18n.TitleKey && translatedTitle != "" {
					notifs[i].Title = translatedTitle
				}
			}
			if meta.I18n.MessageKey != "" {
				translatedMsg := i18n.T(ctx, meta.I18n.MessageKey, meta.I18n.Params)
				if translatedMsg != meta.I18n.MessageKey && translatedMsg != "" {
					notifs[i].Message = translatedMsg
				}
			}
		}
	}
	return notifs
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
		s.emitUserSignalDetached(ctx, userID)
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
		s.emitUserSignalDetached(ctx, userID)
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
		s.emitUserSignalDetached(ctx, userID)
	}

	return affected > 0, err
}

// FetchPreferences returns notification preferences for a user, filling defaults.
func (s *notificationServiceImpl) FetchPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error) {
	prefs, err := s.notificationRepo.GetPreferences(ctx, userID)
	if err != nil {
		return nil, err
	}

	prefByType := make(map[string]system_dto.NotificationPreference, len(prefs))
	for _, p := range prefs {
		prefByType[p.Type] = p
	}

	defaultTypes := []string{"WMS", "HRIS", "SYSTEM"}
	result := make([]system_dto.NotificationPreference, 0, len(defaultTypes))
	for _, t := range defaultTypes {
		if p, ok := prefByType[t]; ok {
			result = append(result, p)
		} else {
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

// NotifyUsers creates a personal notification for each distinct positive user ID in the list.
func (s *notificationServiceImpl) NotifyUsers(ctx context.Context, userIDs []int, notifType, title, message string, actionPayload any, isDone bool) error {
	if len(userIDs) == 0 {
		return nil
	}

	seen := make(map[int]struct{}, len(userIDs))
	for _, uid := range userIDs {
		if uid <= 0 {
			continue
		}
		if _, dup := seen[uid]; dup {
			continue
		}
		seen[uid] = struct{}{}

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
			_, err := s.notificationRepo.CreateNotification(ctx, system_dto.CreateNotificationPayload{
				UserID:        &userID,
				Type:          notifType,
				Title:         title,
				Message:       message,
				ActionPayload: actionPayload,
				IsDone:        isDone,
			})
			if err != nil {
				log.Printf("[NOTIFICATION] Error creating notification for user %d: %v", uid, err)
			} else {
				s.emitUserSignalDetached(ctx, uid)
			}
		}
	}
	return nil
}

// NotifyUsersByPermission creates a single shared-task notification visible to all users with the given permission.
func (s *notificationServiceImpl) NotifyUsersByPermission(ctx context.Context, permissionName, notifType, title, message string, actionPayload any, excludeUserID *int, isDone bool) error {
	_, err := s.notificationRepo.CreateNotification(ctx, system_dto.CreateNotificationPayload{
		UserID:           nil,
		Type:             notifType,
		Title:            title,
		Message:          message,
		ActionPayload:    actionPayload,
		IsDone:           isDone,
		TargetPermission: &permissionName,
		ExcludeUserID:    excludeUserID,
	})

	if err == nil {
		s.emitSharedTaskSignalDetached(ctx, permissionName)
	}

	return err
}
