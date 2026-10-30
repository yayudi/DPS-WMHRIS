package mysql

import (
	"context"
	"database/sql"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/jmoiron/sqlx"
)

type SettingRepository interface {
	database.BaseRepository[system_domain.SystemSetting]
	GetAllSettings(ctx context.Context) ([]system_domain.SystemSetting, error)
	GetSettingByKey(ctx context.Context, key string) (*system_domain.SystemSetting, error)
	GetSettingsAsMap(ctx context.Context) (map[string]system_domain.SystemSetting, error)
}

type settingRepositoryImpl struct {
	database.BaseRepository[system_domain.SystemSetting]
	db *sqlx.DB
}

func NewSettingRepository(db *sqlx.DB) SettingRepository {
	return &settingRepositoryImpl{
		BaseRepository: database.NewBaseRepository[system_domain.SystemSetting](db, "system_settings"),
		db:             db,
	}
}

func (r *settingRepositoryImpl) GetAllSettings(ctx context.Context) ([]system_domain.SystemSetting, error) {
	return r.FindAll(ctx)
}

func (r *settingRepositoryImpl) GetSettingByKey(ctx context.Context, key string) (*system_domain.SystemSetting, error) {
	var setting system_domain.SystemSetting
	query := `SELECT * FROM system_settings WHERE setting_key = ? LIMIT 1`
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &setting, query, key)
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
