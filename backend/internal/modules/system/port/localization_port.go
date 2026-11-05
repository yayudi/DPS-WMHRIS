package port

import (
	"context"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
)

// LocalizationRepository defines the outbound port for database access and cache invalidation.
type LocalizationRepository interface {
	GetActiveLocales(ctx context.Context) ([]domain.Locale, error)
	GetLocaleByCode(ctx context.Context, code string) (*domain.Locale, error)
	GetDefaultLocale(ctx context.Context) (*domain.Locale, error)
	GetRawTranslationsByLocale(ctx context.Context, localeCode string) ([]domain.TranslationItem, error)
	GetAllRawTranslations(ctx context.Context) ([]domain.TranslationItem, error)
	UpsertTranslations(ctx context.Context, localeCode string, items []domain.TranslationItem) error
	IncrementVersion(ctx context.Context, localeCode string) (uint, error)
	GetCachedDictionary(localeCode string) (*domain.LocalizationDictionary, bool)
	SetCachedDictionary(dict *domain.LocalizationDictionary)
	InvalidateCache(localeCode string)
}

// LocalizationUseCase defines the inbound port for localization application logic.
type LocalizationUseCase interface {
	GetAvailableLocales(ctx context.Context) ([]system_dto.LocaleDTO, error)
	GetMergedDictionary(ctx context.Context, localeCode string) (*domain.LocalizationDictionary, error)
	GetTranslationMatrix(ctx context.Context, filter system_dto.TranslationMatrixFilter) (*system_dto.TranslationMatrixResponse, error)
	SaveTranslations(ctx context.Context, req system_dto.SaveTranslationsRequest, audit ...system_dto.AuditMetadata) (uint, error)
}

