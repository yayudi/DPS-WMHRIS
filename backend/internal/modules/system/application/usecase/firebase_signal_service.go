package usecase

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/config"
)

// FirebaseSignalService aliases the hexagonal port for backward compatibility.
type FirebaseSignalService = port.FirebaseSignalService

type firebaseSignalServiceImpl struct{}

// NewFirebaseSignalService constructs a FirebaseSignalService.
func NewFirebaseSignalService() port.FirebaseSignalService {
	return &firebaseSignalServiceImpl{}
}

// SanitizeFirebasePathSegment replaces forbidden Firebase RTDB key characters and path separators with underscores.
func SanitizeFirebasePathSegment(raw string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case '.', '#', '$', '[', ']', '/', '\\':
			return '_'
		default:
			return r
		}
	}, strings.TrimSpace(raw))
}

// EmitSignal writes a signal payload with a millisecond timestamp to Firebase Realtime Database.
func (s *firebaseSignalServiceImpl) EmitSignal(ctx context.Context, path string, payload map[string]any) error {
	if !config.IsFirebaseInitialized || config.FirebaseDB == nil {
		log.Printf("[FIREBASE_SIGNAL] Warning: Cannot emit signal because Firebase is not initialized. Path: %s\n", path)
		return nil
	}

	dataToSet := make(map[string]any, len(payload)+1)
	for k, v := range payload {
		dataToSet[k] = v
	}
	dataToSet["last_updated"] = time.Now().UnixMilli()

	ref := config.FirebaseDB.NewRef(path)
	if err := ref.Set(ctx, dataToSet); err != nil {
		log.Printf("[FIREBASE_SIGNAL] Error emitting signal to %s: %v\n", path, err)
		return err
	}

	return nil
}

// EmitUserSignal emits a refresh signal targeted at a specific user channel.
func (s *firebaseSignalServiceImpl) EmitUserSignal(ctx context.Context, userID string, action string) error {
	if action == "" {
		action = "REFRESH_NOTIFICATIONS"
	}

	safeUserID := SanitizeFirebasePathSegment(userID)
	payload := map[string]any{
		"action": action,
	}

	return s.EmitSignal(ctx, fmt.Sprintf("signals/users/%s", safeUserID), payload)
}

// EmitSharedTaskSignal emits a refresh signal targeted at a shared permission channel.
func (s *firebaseSignalServiceImpl) EmitSharedTaskSignal(ctx context.Context, permission string, action string) error {
	if action == "" {
		action = "REFRESH_NOTIFICATIONS"
	}

	safePermission := SanitizeFirebasePathSegment(permission)
	payload := map[string]any{
		"action": action,
	}

	return s.EmitSignal(ctx, fmt.Sprintf("signals/permissions/%s", safePermission), payload)
}
