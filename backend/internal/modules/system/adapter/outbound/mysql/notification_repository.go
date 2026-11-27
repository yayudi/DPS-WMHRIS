package mysql

import (
	"context"
	"encoding/json"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

// NotificationRepository aliases the hexagonal outbound port for backward compatibility.
type NotificationRepository = port.NotificationRepository

type notificationRepositoryImpl struct {
	db *sqlx.DB
}

// NewNotificationRepository creates a new NotificationRepository.
func NewNotificationRepository(db *sqlx.DB) port.NotificationRepository {
	return &notificationRepositoryImpl{db: db}
}

// permissionSubquery is the common subquery used in multiple notification queries
// to resolve which shared-task notifications a user can see based on their role permissions.
const permissionSubquery = `
	SELECT p.name
	FROM permissions p
	JOIN role_permission rp ON p.id = rp.permission_id
	JOIN users u ON rp.role_id = u.role_id
	WHERE u.id = ?
`

// GetRecentPending fetches recent pending (is_done=0) notifications visible to the user.
func (r *notificationRepositoryImpl) GetRecentPending(ctx context.Context, userID int, limit int) ([]system_dto.NotificationResponse, error) {
	query := `
		SELECT n.id, n.type, n.title, n.message, n.action_payload, n.is_done, n.created_at,
			n.claimed_by, n.claimed_at, u_claim.username AS claimed_by_name
		FROM notifications n
		LEFT JOIN users u_claim ON n.claimed_by = u_claim.id
		WHERE n.is_done = 0
			AND (
				n.user_id = ?
				OR (
					n.target_permission IN (` + permissionSubquery + `)
					AND (n.exclude_user_id IS NULL OR n.exclude_user_id != ?)
				)
			)
		ORDER BY n.created_at DESC
		LIMIT ?
	`
	var rows []system_dto.NotificationResponse
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &rows, query, userID, userID, userID, limit)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []system_dto.NotificationResponse{}
	}
	return rows, nil
}

// GetAll fetches all notifications visible to the user, optionally filtered by type.
func (r *notificationRepositoryImpl) GetAll(ctx context.Context, userID int, filterType string) ([]system_dto.NotificationResponse, error) {
	query := `
		SELECT n.id, n.type, n.title, n.message, n.action_payload, n.is_done, n.created_at,
			n.completed_at, u_comp.username AS completed_by_name,
			n.claimed_by, n.claimed_at, u_claim.username AS claimed_by_name
		FROM notifications n
		LEFT JOIN users u_comp ON n.completed_by = u_comp.id
		LEFT JOIN users u_claim ON n.claimed_by = u_claim.id
		WHERE (
			n.user_id = ?
			OR (
				n.target_permission IN (` + permissionSubquery + `)
				AND (n.exclude_user_id IS NULL OR n.exclude_user_id != ?)
			)
		)
	`
	args := []any{userID, userID, userID}

	if filterType != "" && filterType != "ALL" {
		query += " AND n.type = ?"
		args = append(args, filterType)
	}

	query += " ORDER BY n.created_at DESC LIMIT 50"

	var rows []system_dto.NotificationResponse
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &rows, query, args...)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []system_dto.NotificationResponse{}
	}
	return rows, nil
}

// MarkAsDone marks a single notification as done if the user has access to it.
func (r *notificationRepositoryImpl) MarkAsDone(ctx context.Context, notificationID int, userID int) (int, error) {
	query := `
		UPDATE notifications
		SET is_done = 1, completed_by = ?, completed_at = CURRENT_TIMESTAMP
		WHERE id = ?
			AND (
				user_id = ?
				OR target_permission IN (` + permissionSubquery + `)
			)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, userID, notificationID, userID, userID)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

// MarkAllAsDone marks all pending notifications visible to the user as done.
func (r *notificationRepositoryImpl) MarkAllAsDone(ctx context.Context, userID int) (int, error) {
	query := `
		UPDATE notifications
		SET is_done = 1, completed_by = ?, completed_at = CURRENT_TIMESTAMP
		WHERE is_done = 0
			AND (
				user_id = ?
				OR (
					target_permission IN (` + permissionSubquery + `)
					AND (exclude_user_id IS NULL OR exclude_user_id != ?)
				)
			)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, userID, userID, userID, userID)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

// ClaimTask claims an unclaimed, undone notification for the user.
func (r *notificationRepositoryImpl) ClaimTask(ctx context.Context, notificationID int, userID int) (int, error) {
	query := `
		UPDATE notifications
		SET claimed_by = ?, claimed_at = CURRENT_TIMESTAMP
		WHERE id = ?
			AND claimed_by IS NULL
			AND is_done = 0
			AND (
				user_id = ?
				OR target_permission IN (` + permissionSubquery + `)
			)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query, userID, notificationID, userID, userID)
	if err != nil {
		return 0, err
	}
	affected, err := res.RowsAffected()
	return int(affected), err
}

// GetPreferences fetches the user's notification preferences.
func (r *notificationRepositoryImpl) GetPreferences(ctx context.Context, userID int) ([]system_dto.NotificationPreference, error) {
	query := "SELECT type, is_enabled FROM user_notification_preferences WHERE user_id = ?"
	var prefs []system_dto.NotificationPreference
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &prefs, query, userID)
	if err != nil {
		return nil, err
	}
	if prefs == nil {
		prefs = []system_dto.NotificationPreference{}
	}
	return prefs, nil
}

// UpsertPreference inserts or updates a single notification preference for a user.
func (r *notificationRepositoryImpl) UpsertPreference(ctx context.Context, userID int, notifType string, isEnabled bool) error {
	isEnabledInt := 0
	if isEnabled {
		isEnabledInt = 1
	}
	query := "INSERT INTO user_notification_preferences (user_id, type, is_enabled) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_enabled = ?"
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, userID, notifType, isEnabledInt, isEnabledInt)
	return err
}

// CreateNotification creates a new notification row.
func (r *notificationRepositoryImpl) CreateNotification(ctx context.Context, payload system_dto.CreateNotificationPayload) (int, error) {
	actionPayloadStr, err := serializeNotificationPayload(payload.ActionPayload)
	if err != nil {
		return 0, err
	}

	isDoneInt := 0
	if payload.IsDone {
		isDoneInt = 1
	}

	query := `
		INSERT INTO notifications
		(user_id, type, title, message, action_payload, is_done, target_permission, exclude_user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	ext := database.GetExt(ctx, r.db)
	res, err := ext.ExecContext(ctx, query,
		payload.UserID, payload.Type, payload.Title, payload.Message,
		actionPayloadStr, isDoneInt, payload.TargetPermission, payload.ExcludeUserID,
	)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return int(id), err
}

func serializeNotificationPayload(raw any) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	switch v := raw.(type) {
	case json.RawMessage:
		if len(v) == 0 || string(v) == "null" {
			return nil, nil
		}
		if json.Valid(v) {
			s := string(v)
			return &s, nil
		}
	case []byte:
		if len(v) == 0 || string(v) == "null" {
			return nil, nil
		}
		if json.Valid(v) {
			s := string(v)
			return &s, nil
		}
	case string:
		if v == "" || v == "null" {
			return nil, nil
		}
		if json.Valid([]byte(v)) {
			return &v, nil
		}
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	str := string(encoded)
	if str == "null" {
		return nil, nil
	}
	return &str, nil
}
