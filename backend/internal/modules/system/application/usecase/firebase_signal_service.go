package usecase

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/dps-wmhris/backend/internal/shared/config"
)

type FirebaseSignalService interface {
	EmitSignal(ctx context.Context, path string, payload map[string]interface{}) error
	EmitUserSignal(ctx context.Context, userId string, action string) error
	EmitSharedTaskSignal(ctx context.Context, permission string, action string) error
}

type firebaseSignalServiceImpl struct{}

func NewFirebaseSignalService() FirebaseSignalService {
	return &firebaseSignalServiceImpl{}
}

func (s *firebaseSignalServiceImpl) EmitSignal(ctx context.Context, path string, payload map[string]interface{}) error {
	if !config.IsFirebaseInitialized || config.FirebaseDB == nil {
		log.Printf("[FIREBASE_SIGNAL] Warning: Cannot emit signal because Firebase is not initialized. Path: %s\n", path)
		return nil
	}

	dataToSet := make(map[string]interface{})
	for k, v := range payload {
		dataToSet[k] = v
	}
	dataToSet["last_updated"] = time.Now().UnixNano() / int64(time.Millisecond)

	ref := config.FirebaseDB.NewRef(path)
	err := ref.Set(ctx, dataToSet)
	if err != nil {
		log.Printf("[FIREBASE_SIGNAL] Error emitting signal to %s: %v\n", path, err)
		return err
	}

	return nil
}

func (s *firebaseSignalServiceImpl) EmitUserSignal(ctx context.Context, userId string, action string) error {
	if action == "" {
		action = "REFRESH_NOTIFICATIONS"
	}

	// Sanitize userId (replace special characters with underscore)
	safeUserId := strings.Map(func(r rune) rune {
		if r == '.' || r == '#' || r == '$' || r == '[' || r == ']' {
			return '_'
		}
		return r
	}, userId)

	payload := map[string]interface{}{
		"action": action,
	}

	return s.EmitSignal(ctx, fmt.Sprintf("signals/users/%s", safeUserId), payload)
}

func (s *firebaseSignalServiceImpl) EmitSharedTaskSignal(ctx context.Context, permission string, action string) error {
	if action == "" {
		action = "REFRESH_NOTIFICATIONS"
	}

	// Sanitize permission
	safePermission := strings.Map(func(r rune) rune {
		if r == '.' || r == '#' || r == '$' || r == '[' || r == ']' {
			return '_'
		}
		return r
	}, permission)

	payload := map[string]interface{}{
		"action": action,
	}

	return s.EmitSignal(ctx, fmt.Sprintf("signals/permissions/%s", safePermission), payload)
}
