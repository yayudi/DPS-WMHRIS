package usecase

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/modules/system/port"
	"github.com/dps-wmhris/backend/internal/shared/database"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
	"github.com/dps-wmhris/backend/internal/shared/i18n"
)

type localizationServiceImpl struct {
	repo      port.LocalizationRepository
	txManager database.TransactionManager
	eventBus  eventbus.EventBus
	buildMu   sync.Mutex
}

// NewLocalizationService creates a new instance of LocalizationUseCase.
func NewLocalizationService(repo port.LocalizationRepository, txManager database.TransactionManager, bus ...eventbus.EventBus) port.LocalizationUseCase {
	var eb eventbus.EventBus
	if len(bus) > 0 {
		eb = bus[0]
	}
	svc := &localizationServiceImpl{
		repo:      repo,
		txManager: txManager,
		eventBus:  eb,
	}

	i18n.RegisterLookupHook(func(ctx context.Context, locale, fullKey string) (string, bool) {
		dict, err := svc.GetMergedDictionary(ctx, locale)
		if err != nil || dict == nil {
			return "", false
		}
		val, ok := dict.Entries[fullKey]
		return val, ok
	})

	return svc
}

func (s *localizationServiceImpl) GetAvailableLocales(ctx context.Context) ([]system_dto.LocaleDTO, error) {
	locales, err := s.repo.GetActiveLocales(ctx)
	if err != nil {
		return nil, err
	}

	result := make([]system_dto.LocaleDTO, 0, len(locales))
	codes := make([]string, 0, len(locales))
	for _, l := range locales {
		codes = append(codes, l.Code)
		result = append(result, system_dto.LocaleDTO{
			Code:      l.Code,
			Name:      l.Name,
			IsDefault: l.IsDefault,
			Version:   l.Version,
		})
	}
	i18n.RegisterSupportedLocales(codes)
	return result, nil
}

func (s *localizationServiceImpl) GetMergedDictionary(ctx context.Context, localeCode string) (*domain.LocalizationDictionary, error) {
	// 1. Resolve dynamic baseline locale
	baseLoc, err := s.repo.GetDefaultLocale(ctx)
	if err != nil || baseLoc == nil {
		baseLoc, err = s.repo.GetLocaleByCode(ctx, "id-ID")
		if err != nil || baseLoc == nil {
			return nil, fmt.Errorf("default locale not found in database: %v", err)
		}
	}

	if localeCode == "" {
		localeCode = baseLoc.Code
	}

	targetLoc := baseLoc
	if localeCode != baseLoc.Code {
		loc, err := s.repo.GetLocaleByCode(ctx, localeCode)
		if err != nil {
			return nil, err
		}
		if loc != nil && loc.IsActive {
			targetLoc = loc
		} else {
			localeCode = baseLoc.Code
		}
	}

	// Calculate composite version so changes to either base or target via CLI seeder invalidate stale cache
	effectiveVersion := baseLoc.Version
	if localeCode != baseLoc.Code {
		effectiveVersion = (baseLoc.Version * 100000) + targetLoc.Version
	}

	// 2. Check in-memory cache with composite version coherence check (Fast Path)
	if cached, ok := s.repo.GetCachedDictionary(localeCode); ok && cached.Version == effectiveVersion {
		return cached, nil
	}

	// 3. Mutex lock for in-flight build to prevent cache stampede
	s.buildMu.Lock()
	defer s.buildMu.Unlock()

	// Double check under lock
	if cached, ok := s.repo.GetCachedDictionary(localeCode); ok && cached.Version == effectiveVersion {
		return cached, nil
	}

	// 4. Resolve baseline translations (reuse cached baseline if available & valid)
	mergedEntries := make(map[string]string)
	if cachedBase, ok := s.repo.GetCachedDictionary(baseLoc.Code); ok && cachedBase.Version == baseLoc.Version {
		for k, v := range cachedBase.Entries {
			mergedEntries[k] = v
		}
	} else {
		baseItems, err := s.repo.GetRawTranslationsByLocale(ctx, baseLoc.Code)
		if err != nil {
			return nil, fmt.Errorf("failed to load baseline translations: %w", err)
		}
		for _, item := range baseItems {
			fullKey := fmt.Sprintf("%s.%s", item.Module, item.Key)
			mergedEntries[fullKey] = item.Value
		}
		// Warm baseline dictionary into cache if target is not base
		if localeCode != baseLoc.Code {
			s.repo.SetCachedDictionary(&domain.LocalizationDictionary{
				Locale:  baseLoc.Code,
				Version: baseLoc.Version,
				Entries: mergedEntries,
			})
		}
	}

	// 5. If target is not baseline, override with target translations
	if localeCode != baseLoc.Code {
		targetItems, err := s.repo.GetRawTranslationsByLocale(ctx, localeCode)
		if err != nil {
			return nil, fmt.Errorf("failed to load translations for %s: %w", localeCode, err)
		}
		for _, item := range targetItems {
			fullKey := fmt.Sprintf("%s.%s", item.Module, item.Key)
			mergedEntries[fullKey] = item.Value
		}
	}

	dict := &domain.LocalizationDictionary{
		Locale:  localeCode,
		Version: effectiveVersion,
		Entries: mergedEntries,
	}

	// 6. Store in memory cache
	s.repo.SetCachedDictionary(dict)

	return dict, nil
}

func (s *localizationServiceImpl) GetTranslationMatrix(ctx context.Context, filter system_dto.TranslationMatrixFilter) (*system_dto.TranslationMatrixResponse, error) {
	locales, err := s.repo.GetActiveLocales(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch active locales: %w", err)
	}

	rawItems, err := s.repo.GetAllRawTranslations(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch raw translations: %w", err)
	}

	localeDTOs := make([]system_dto.LocaleDTO, 0, len(locales))
	activeLocaleCodes := make([]string, 0, len(locales))
	for _, l := range locales {
		activeLocaleCodes = append(activeLocaleCodes, l.Code)
		localeDTOs = append(localeDTOs, system_dto.LocaleDTO{
			Code:      l.Code,
			Name:      l.Name,
			IsDefault: l.IsDefault,
			Version:   l.Version,
		})
	}

	// 1. Group raw translations by (module, key)
	type keyIdentifier struct {
		Module string
		Key    string
	}
	matrixMap := make(map[keyIdentifier]map[string]string)
	moduleSet := make(map[string]bool)
	var orderedKeys []keyIdentifier

	for _, item := range rawItems {
		id := keyIdentifier{Module: item.Module, Key: item.Key}
		if _, exists := matrixMap[id]; !exists {
			matrixMap[id] = make(map[string]string)
			orderedKeys = append(orderedKeys, id)
			moduleSet[item.Module] = true
		}
		matrixMap[id][item.LocaleCode] = item.Value
	}

	// Extract sorted modules
	modules := make([]string, 0, len(moduleSet))
	for m := range moduleSet {
		modules = append(modules, m)
	}
	sort.Strings(modules)

	// 2. Calculate completeness stats per active locale
	stats := make([]system_dto.LocaleCompletenessStat, 0, len(activeLocaleCodes))
	totalKeys := len(orderedKeys)

	for _, locCode := range activeLocaleCodes {
		translatedCount := 0
		for _, id := range orderedKeys {
			if val := strings.TrimSpace(matrixMap[id][locCode]); val != "" {
				translatedCount++
			}
		}
		missingCount := totalKeys - translatedCount
		pct := 0.0
		if totalKeys > 0 {
			pct = (float64(translatedCount) / float64(totalKeys)) * 100.0
		}
		stats = append(stats, system_dto.LocaleCompletenessStat{
			LocaleCode:      locCode,
			TranslatedCount: translatedCount,
			MissingCount:    missingCount,
			Percentage:      math.Round(pct*100) / 100,
		})
	}

	// 3. Build rows with filtering
	rows := make([]system_dto.TranslationMatrixRow, 0, totalKeys)
	filterModule := strings.TrimSpace(filter.Module)
	filterSearch := strings.ToLower(strings.TrimSpace(filter.Search))

	for _, id := range orderedKeys {
		if filterModule != "" && id.Module != filterModule {
			continue
		}

		vals := matrixMap[id]
		isComplete := true
		for _, locCode := range activeLocaleCodes {
			if strings.TrimSpace(vals[locCode]) == "" {
				isComplete = false
				break
			}
		}

		if filter.MissingOnly && isComplete {
			continue
		}

		if filterSearch != "" {
			matched := strings.Contains(strings.ToLower(id.Module), filterSearch) ||
				strings.Contains(strings.ToLower(id.Key), filterSearch)
			if !matched {
				for _, v := range vals {
					if strings.Contains(strings.ToLower(v), filterSearch) {
						matched = true
						break
					}
				}
			}
			if !matched {
				continue
			}
		}

		rows = append(rows, system_dto.TranslationMatrixRow{
			Module:     id.Module,
			Key:        id.Key,
			Values:     vals,
			IsComplete: isComplete,
		})
	}

	return &system_dto.TranslationMatrixResponse{
		Locales:   localeDTOs,
		Modules:   modules,
		TotalKeys: totalKeys,
		Stats:     stats,
		Rows:      rows,
	}, nil
}

func isValidKeyIdentifier(s string) bool {
	if len(s) == 0 {
		return false
	}
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.') {
			return false
		}
	}
	return true
}

func (s *localizationServiceImpl) SaveTranslations(ctx context.Context, req system_dto.SaveTranslationsRequest, audit ...system_dto.AuditMetadata) (uint, error) {
	loc, err := s.repo.GetLocaleByCode(ctx, req.LocaleCode)
	if err != nil {
		return 0, err
	}
	if loc == nil || !loc.IsActive {
		return 0, domain.ErrLocaleNotFoundOrInactive
	}

	items := make([]domain.TranslationItem, 0, len(req.Translations))
	for _, t := range req.Translations {
		cleanModule := strings.TrimSpace(t.Module)
		cleanKey := strings.TrimSpace(t.Key)
		if !isValidKeyIdentifier(cleanModule) || !isValidKeyIdentifier(cleanKey) {
			return 0, domain.ErrInvalidTranslationKey
		}

		items = append(items, domain.TranslationItem{
			LocaleCode: req.LocaleCode,
			Module:     cleanModule,
			Key:        cleanKey,
			Value:      t.Value,
		})
	}

	runSave := func(txCtx context.Context) (uint, error) {
		if err := s.repo.UpsertTranslations(txCtx, req.LocaleCode, items); err != nil {
			return 0, err
		}
		return s.repo.IncrementVersion(txCtx, req.LocaleCode)
	}

	var newVersion uint
	if s.txManager == nil {
		ver, err := runSave(ctx)
		if err != nil {
			return 0, err
		}
		newVersion = ver
	} else {
		err = s.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
			ver, txErr := runSave(txCtx)
			if txErr != nil {
				return txErr
			}
			newVersion = ver
			return nil
		})
		if err != nil {
			return 0, err
		}
	}

	// Post-commit cache invalidation ensures no stale concurrent reads linger in cache
	s.repo.InvalidateCache(req.LocaleCode)

	// Publish audit log if EventBus and audit context are present
	if s.eventBus != nil && len(audit) > 0 {
		meta := audit[0]
		_ = eventbus.PublishAuditLog(ctx, s.eventBus, eventbus.AuditLogInput{
			UserID:     meta.UserID,
			Action:     "UPDATE_LOCALIZATION",
			TargetType: "localization_locales",
			TargetID:   req.LocaleCode,
			Changes: map[string]any{
				"locale_code":  req.LocaleCode,
				"keys_count":   len(req.Translations),
				"new_version":  newVersion,
			},
			IP:        meta.IP,
			UserAgent: meta.UserAgent,
		})
	}

	return newVersion, nil
}

