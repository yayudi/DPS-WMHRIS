package mysql

import (
	"context"
	"database/sql"

	"github.com/dps-wmhris/backend/internal/modules/iam/domain"
	"github.com/dps-wmhris/backend/internal/modules/iam/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type userPreferenceRepositoryImpl struct {
	db *sqlx.DB
}

func NewUserPreferenceRepository(db *sqlx.DB) port.UserPreferenceRepository {
	return &userPreferenceRepositoryImpl{db: db}
}

func (r *userPreferenceRepositoryImpl) GetByUserID(ctx context.Context, userID int) (*domain.UserPreference, error) {
	var pref domain.UserPreference
	query := `
		SELECT user_id, locale, theme, timezone, date_format, created_at, updated_at
		FROM user_preferences
		WHERE user_id = ?
		LIMIT 1
	`
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &pref, query, userID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &pref, nil
}

func (r *userPreferenceRepositoryImpl) Upsert(ctx context.Context, pref *domain.UserPreference) error {
	query := `
		INSERT INTO user_preferences (user_id, locale, theme, timezone, date_format)
		VALUES (?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			locale = VALUES(locale),
			theme = VALUES(theme),
			timezone = VALUES(timezone),
			date_format = VALUES(date_format),
			updated_at = CURRENT_TIMESTAMP
	`
	ext := database.GetExt(ctx, r.db)
	_, err := ext.ExecContext(ctx, query, pref.UserID, pref.Locale, pref.Theme, pref.Timezone, pref.DateFormat)
	return err
}

