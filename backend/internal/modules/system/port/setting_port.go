package port

import (
	"context"

	system_domain "github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/database"
)

// SettingRepository defines outbound persistence operations for runtime system settings.
type SettingRepository interface {
	database.BaseRepository[system_domain.SystemSetting]
	GetAllSettings(ctx context.Context) ([]system_domain.SystemSetting, error)
	GetSettingByKey(ctx context.Context, key string) (*system_domain.SystemSetting, error)
	GetSettingsAsMap(ctx context.Context) (map[string]system_domain.SystemSetting, error)
}
