package repository

import (
	"context"
	"database/sql"

	"github.com/dps-wmhris/backend/internal/model"
	"github.com/jmoiron/sqlx"
)

type SettingRepository interface {
	GetAllSettings(ctx context.Context) ([]model.SystemSetting, error)
	GetSettingByKey(ctx context.Context, key string) (*model.SystemSetting, error)
	GetSettingsAsMap(ctx context.Context) (map[string]model.SystemSetting, error)
}

type settingRepositoryImpl struct {
	db *sqlx.DB
}

func NewSettingRepository(db *sqlx.DB) SettingRepository {
	return &settingRepositoryImpl{db: db}
}

func (r *settingRepositoryImpl) GetAllSettings(ctx context.Context) ([]model.SystemSetting, error) {
	var settings []model.SystemSetting
	query := `SELECT * FROM system_settings`
	err := r.db.SelectContext(ctx, &settings, query)
	return settings, err
}

func (r *settingRepositoryImpl) GetSettingByKey(ctx context.Context, key string) (*model.SystemSetting, error) {
	var setting model.SystemSetting
	query := `SELECT * FROM system_settings WHERE setting_key = ? LIMIT 1`
	err := r.db.GetContext(ctx, &setting, query, key)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &setting, err
}

func (r *settingRepositoryImpl) GetSettingsAsMap(ctx context.Context) (map[string]model.SystemSetting, error) {
	settings, err := r.GetAllSettings(ctx)
	if err != nil {
		return nil, err
	}
	
	settingsMap := make(map[string]model.SystemSetting)
	for _, s := range settings {
		settingsMap[s.SettingKey] = s
	}
	return settingsMap, nil
}
