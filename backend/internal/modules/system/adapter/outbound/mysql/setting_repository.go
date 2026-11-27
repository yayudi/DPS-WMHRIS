package mysql

import (
	"context"
	"database/sql"
	"errors"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	database "github.com/dps-wmhris/backend/internal/shared/database"

	"github.com/jmoiron/sqlx"
)

// SettingRepository aliases the hexagonal outbound port for backward compatibility.
type SettingRepository = port.SettingRepository

type settingRepositoryImpl struct {
	database.BaseRepository[system_domain.SystemSetting]
	db *sqlx.DB
}

// NewSettingRepository constructs a MySQL-backed SettingRepository.
func NewSettingRepository(db *sqlx.DB) port.SettingRepository {
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
	if errors.Is(err, sql.ErrNoRows) {
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
