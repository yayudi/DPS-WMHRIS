package mysql

import (
	"context"
	"database/sql"
	"strings"
	"sync"
	"time"

	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/jmoiron/sqlx"
)

type localizationRepositoryImpl struct {
	db             *sqlx.DB
	cache          map[string]*domain.LocalizationDictionary
	localesCache   map[string]domain.Locale
	defaultLocale  string
	localeCacheExp time.Time
	localeCacheTTL time.Duration
	mu             sync.RWMutex
}

// NewLocalizationRepository constructs a thread-safe repository with read-through in-memory caching.
func NewLocalizationRepository(db *sqlx.DB) port.LocalizationRepository {
	return &localizationRepositoryImpl{
		db:             db,
		cache:          make(map[string]*domain.LocalizationDictionary),
		localesCache:   make(map[string]domain.Locale),
		localeCacheTTL: 5 * time.Second,
	}
}

func (r *localizationRepositoryImpl) GetActiveLocales(ctx context.Context) ([]domain.Locale, error) {
	r.mu.RLock()
	if time.Now().Before(r.localeCacheExp) && len(r.localesCache) > 0 {
		result := make([]domain.Locale, 0, len(r.localesCache))
		for _, l := range r.localesCache {
			result = append(result, l)
		}
		r.mu.RUnlock()
		return result, nil
	}
	r.mu.RUnlock()

	r.mu.Lock()
	defer r.mu.Unlock()

	// Double-check under write lock
	if time.Now().Before(r.localeCacheExp) && len(r.localesCache) > 0 {
		result := make([]domain.Locale, 0, len(r.localesCache))
		for _, l := range r.localesCache {
			result = append(result, l)
		}
		return result, nil
	}

	var locales []domain.Locale
	query := `
		SELECT code, name, is_default, is_active, version, updated_at
		FROM localization_locales
		WHERE is_active = 1
		ORDER BY is_default DESC, name ASC
	`
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &locales, query)
	if err != nil {
		return nil, err
	}

	r.localesCache = make(map[string]domain.Locale, len(locales))
	var defCode string
	for _, l := range locales {
		r.localesCache[l.Code] = l
		if l.IsDefault && defCode == "" {
			defCode = l.Code
		}
	}
	if defCode == "" && len(locales) > 0 {
		defCode = locales[0].Code
	}
	if defCode == "" {
		defCode = "id-ID"
	}
	r.defaultLocale = defCode
	r.localeCacheExp = time.Now().Add(r.localeCacheTTL)

	return locales, nil
}

func (r *localizationRepositoryImpl) GetLocaleByCode(ctx context.Context, code string) (*domain.Locale, error) {
	r.mu.RLock()
	if time.Now().Before(r.localeCacheExp) && len(r.localesCache) > 0 {
		if loc, ok := r.localesCache[code]; ok {
			r.mu.RUnlock()
			locCopy := loc
			return &locCopy, nil
		}
	}
	r.mu.RUnlock()

	// Refresh cache if expired or missing from active map
	if _, err := r.GetActiveLocales(ctx); err == nil {
		r.mu.RLock()
		if loc, ok := r.localesCache[code]; ok {
			r.mu.RUnlock()
			locCopy := loc
			return &locCopy, nil
		}
		r.mu.RUnlock()
	}

	// Fallback to direct DB query in case locale is inactive
	var loc domain.Locale
	query := `
		SELECT code, name, is_default, is_active, version, updated_at
		FROM localization_locales
		WHERE code = ?
		LIMIT 1
	`
	ext := database.GetExt(ctx, r.db)
	err := ext.GetContext(ctx, &loc, query, code)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &loc, nil
}

func (r *localizationRepositoryImpl) GetDefaultLocale(ctx context.Context) (*domain.Locale, error) {
	r.mu.RLock()
	if time.Now().Before(r.localeCacheExp) && r.defaultLocale != "" {
		if loc, ok := r.localesCache[r.defaultLocale]; ok {
			r.mu.RUnlock()
			locCopy := loc
			return &locCopy, nil
		}
	}
	r.mu.RUnlock()

	locales, err := r.GetActiveLocales(ctx)
	if err != nil {
		return nil, err
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.defaultLocale != "" {
		if loc, ok := r.localesCache[r.defaultLocale]; ok {
			locCopy := loc
			return &locCopy, nil
		}
	}

	for _, l := range locales {
		if l.IsDefault {
			locCopy := l
			return &locCopy, nil
		}
	}
	if len(locales) > 0 {
		locCopy := locales[0]
		return &locCopy, nil
	}
	return nil, sql.ErrNoRows
}

func (r *localizationRepositoryImpl) GetRawTranslationsByLocale(ctx context.Context, localeCode string) ([]domain.TranslationItem, error) {
	var items []domain.TranslationItem
	query := `
		SELECT id, locale_code, module, translation_key, translation_value, updated_at
		FROM localization_translations
		WHERE locale_code = ?
		ORDER BY module ASC, translation_key ASC
	`
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &items, query, localeCode)
	return items, err
}

func (r *localizationRepositoryImpl) GetAllRawTranslations(ctx context.Context) ([]domain.TranslationItem, error) {
	var items []domain.TranslationItem
	query := `
		SELECT id, locale_code, module, translation_key, translation_value, updated_at
		FROM localization_translations
		ORDER BY module ASC, translation_key ASC, locale_code ASC
	`
	ext := database.GetExt(ctx, r.db)
	err := ext.SelectContext(ctx, &items, query)
	return items, err
}

func (r *localizationRepositoryImpl) UpsertTranslations(ctx context.Context, localeCode string, items []domain.TranslationItem) error {
	if len(items) == 0 {
		return nil
	}

	ext := database.GetExt(ctx, r.db)
	const batchSize = 500

	for start := 0; start < len(items); start += batchSize {
		end := start + batchSize
		if end > len(items) {
			end = len(items)
		}
		chunk := items[start:end]

		var sb strings.Builder
		sb.WriteString("INSERT INTO localization_translations (locale_code, module, translation_key, translation_value) VALUES ")
		args := make([]interface{}, 0, len(chunk)*4)

		for i, item := range chunk {
			if i > 0 {
				sb.WriteString(", ")
			}
			sb.WriteString("(?, ?, ?, ?)")
			args = append(args, localeCode, item.Module, item.Key, item.Value)
		}
		sb.WriteString(" ON DUPLICATE KEY UPDATE translation_value = VALUES(translation_value), updated_at = CURRENT_TIMESTAMP")

		if _, err := ext.ExecContext(ctx, sb.String(), args...); err != nil {
			return err
		}
	}

	r.InvalidateCache(localeCode)
	return nil
}

func (r *localizationRepositoryImpl) IncrementVersion(ctx context.Context, localeCode string) (uint, error) {
	query := `UPDATE localization_locales SET version = version + 1 WHERE code = ?`
	ext := database.GetExt(ctx, r.db)
	if _, err := ext.ExecContext(ctx, query, localeCode); err != nil {
		return 0, err
	}

	r.InvalidateCache(localeCode)

	var ver uint
	err := ext.GetContext(ctx, &ver, `SELECT version FROM localization_locales WHERE code = ?`, localeCode)
	if err != nil {
		return 1, err
	}
	return ver, nil
}

func (r *localizationRepositoryImpl) GetCachedDictionary(localeCode string) (*domain.LocalizationDictionary, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	dict, exists := r.cache[localeCode]
	if !exists || dict == nil {
		return nil, false
	}

	// Defensive copy so callers cannot mutate the internal cache map
	copiedEntries := make(map[string]string, len(dict.Entries))
	for k, v := range dict.Entries {
		copiedEntries[k] = v
	}

	return &domain.LocalizationDictionary{
		Locale:  dict.Locale,
		Version: dict.Version,
		Entries: copiedEntries,
	}, true
}

func (r *localizationRepositoryImpl) SetCachedDictionary(dict *domain.LocalizationDictionary) {
	if dict == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	copiedEntries := make(map[string]string, len(dict.Entries))
	for k, v := range dict.Entries {
		copiedEntries[k] = v
	}

	r.cache[dict.Locale] = &domain.LocalizationDictionary{
		Locale:  dict.Locale,
		Version: dict.Version,
		Entries: copiedEntries,
	}
}

func (r *localizationRepositoryImpl) InvalidateCache(localeCode string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Invalidate metadata cache TTL so next read re-fetches metadata/versions
	r.localeCacheExp = time.Time{}

	// Jika localeCode kosong atau base fallback default berubah, bersihkan seluruh cache kamus
	if localeCode == "" || localeCode == r.defaultLocale || (r.defaultLocale == "" && localeCode == "id-ID") {
		r.cache = make(map[string]*domain.LocalizationDictionary)
		return
	}
	delete(r.cache, localeCode)
}

