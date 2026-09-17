package mysql

import (
	"context"
	"database/sql"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"

	"github.com/jmoiron/sqlx"
)

type SettingRepository interface {
	GetAllSettings(ctx context.Context) ([]system_domain.SystemSetting, error)
	GetSettingByKey(ctx context.Context, key string) (*system_domain.SystemSetting, error)
	GetSettingsAsMap(ctx context.Context) (map[string]system_domain.SystemSetting, error)
}

type settingRepositoryImpl struct {
	db *sqlx.DB
}

func NewSettingRepository(db *sqlx.DB) SettingRepository {
	return &settingRepositoryImpl{db: db}
}

func (r *settingRepositoryImpl) GetAllSettings(ctx context.Context) ([]system_domain.SystemSetting, error) {
	var settings []system_domain.SystemSetting
	query := `SELECT * FROM system_settings`
	err := r.db.SelectContext(ctx, &settings, query)
	return settings, err
}

func (r *settingRepositoryImpl) GetSettingByKey(ctx context.Context, key string) (*system_domain.SystemSetting, error) {
	var setting system_domain.SystemSetting
	query := `SELECT * FROM system_settings WHERE setting_key = ? LIMIT 1`
	err := r.db.GetContext(ctx, &setting, query, key)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &setting, err
}

func (r *settingRepositoryImpl) GetSettingsAsMap(ctx context.Context) (map[string]system_domain.SystemSetting, error) {
	settings, err := r.GetAllSettings(ctx)
	if err != nil {
		return nil, err
	}

	settingsMap := make(map[string]system_domain.SystemSetting)
	for _, s := range settings {
		settingsMap[s.SettingKey] = s
	}
	return settingsMap, nil
}
