package usecase_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	system_dto "github.com/dps-wmhris/backend/internal/modules/system/application/dto"
	"github.com/dps-wmhris/backend/internal/modules/system/application/usecase"
	"github.com/dps-wmhris/backend/internal/modules/system/domain"
	"github.com/dps-wmhris/backend/internal/shared/eventbus"
)

type mockTxManager struct {
	wasCalled bool
	failTx    bool
}

func (m *mockTxManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	m.wasCalled = true
	if m.failTx {
		return errors.New("simulated transaction failure")
	}
	return fn(ctx)
}

// mockLocalizationRepo implements port.LocalizationRepository in memory for unit testing.
type mockLocalizationRepo struct {
	locales       map[string]domain.Locale
	translations  map[string][]domain.TranslationItem
	cache         map[string]*domain.LocalizationDictionary
	rawQueryCount map[string]int
}

func newMockRepo() *mockLocalizationRepo {
	return &mockLocalizationRepo{
		locales: map[string]domain.Locale{
			"id-ID": {Code: "id-ID", Name: "Bahasa Indonesia", IsDefault: true, IsActive: true, Version: 1},
			"en-US": {Code: "en-US", Name: "English", IsDefault: false, IsActive: true, Version: 2},
		},
		translations: map[string][]domain.TranslationItem{
			"id-ID": {
				{Module: "common", Key: "btn.save", Value: "Simpan"},
				{Module: "common", Key: "btn.cancel", Value: "Batal"},
				{Module: "wms", Key: "stock.nonzero", Value: "Tidak Kosong"},
			},
			"en-US": {
				{Module: "common", Key: "btn.save", Value: "Save"},
				// Notice: btn.cancel is intentionally omitted in en-US to test fallback merging!
				{Module: "wms", Key: "stock.nonzero", Value: "Non Zero"},
			},
		},
		cache:         make(map[string]*domain.LocalizationDictionary),
		rawQueryCount: make(map[string]int),
	}
}

func (m *mockLocalizationRepo) GetActiveLocales(ctx context.Context) ([]domain.Locale, error) {
	var list []domain.Locale
	for _, l := range m.locales {
		list = append(list, l)
	}
	return list, nil
}

func (m *mockLocalizationRepo) GetLocaleByCode(ctx context.Context, code string) (*domain.Locale, error) {
	loc, ok := m.locales[code]
	if !ok {
		return nil, nil
	}
	return &loc, nil
}

func (m *mockLocalizationRepo) GetDefaultLocale(ctx context.Context) (*domain.Locale, error) {
	for _, l := range m.locales {
		if l.IsDefault {
			return &l, nil
		}
	}
	for _, l := range m.locales {
		return &l, nil
	}
	return nil, nil
}

func (m *mockLocalizationRepo) GetRawTranslationsByLocale(ctx context.Context, localeCode string) ([]domain.TranslationItem, error) {
	m.rawQueryCount[localeCode]++
	return m.translations[localeCode], nil
}

func (m *mockLocalizationRepo) GetAllRawTranslations(ctx context.Context) ([]domain.TranslationItem, error) {
	var all []domain.TranslationItem
	for loc, items := range m.translations {
		for _, item := range items {
			item.LocaleCode = loc
			all = append(all, item)
		}
	}
	return all, nil
}

func (m *mockLocalizationRepo) UpsertTranslations(ctx context.Context, localeCode string, items []domain.TranslationItem) error {
	m.translations[localeCode] = append(m.translations[localeCode], items...)
	m.InvalidateCache(localeCode)
	return nil
}

func (m *mockLocalizationRepo) IncrementVersion(ctx context.Context, localeCode string) (uint, error) {
	loc := m.locales[localeCode]
	loc.Version++
	m.locales[localeCode] = loc
	m.InvalidateCache(localeCode)
	return loc.Version, nil
}

func (m *mockLocalizationRepo) GetCachedDictionary(localeCode string) (*domain.LocalizationDictionary, bool) {
	dict, ok := m.cache[localeCode]
	return dict, ok
}

func (m *mockLocalizationRepo) SetCachedDictionary(dict *domain.LocalizationDictionary) {
	if dict != nil {
		m.cache[dict.Locale] = dict
	}
}

func (m *mockLocalizationRepo) InvalidateCache(localeCode string) {
	defCode := "id-ID"
	for _, l := range m.locales {
		if l.IsDefault {
			defCode = l.Code
			break
		}
	}
	if localeCode == "" || localeCode == defCode {
		m.cache = make(map[string]*domain.LocalizationDictionary)
		return
	}
	delete(m.cache, localeCode)
}

func TestLocalizationService_FallbackMerging(t *testing.T) {
	repo := newMockRepo()
	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)
	ctx := context.Background()

	// 1. Fetch en-US dictionary (composite version should be 1*100000 + 2 = 100002)
	dict, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil {
		t.Fatalf("unexpected error fetching en-US dictionary: %v", err)
	}

	if dict.Locale != "en-US" {
		t.Errorf("expected locale en-US, got %s", dict.Locale)
	}

	expectedInitialVersion := uint(100002)
	if dict.Version != expectedInitialVersion {
		t.Errorf("expected composite version %d, got %d", expectedInitialVersion, dict.Version)
	}

	// Overridden key: common.btn.save should be "Save"
	if dict.Entries["common.btn.save"] != "Save" {
		t.Errorf("expected 'common.btn.save' to be 'Save', got '%s'", dict.Entries["common.btn.save"])
	}

	// Fallback key: common.btn.cancel was not in en-US, so it MUST fall back to id-ID value "Batal"
	if dict.Entries["common.btn.cancel"] != "Batal" {
		t.Errorf("expected fallback 'common.btn.cancel' to be 'Batal', got '%s'", dict.Entries["common.btn.cancel"])
	}

	// Overridden key: wms.stock.nonzero
	if dict.Entries["wms.stock.nonzero"] != "Non Zero" {
		t.Errorf("expected 'wms.stock.nonzero' to be 'Non Zero', got '%s'", dict.Entries["wms.stock.nonzero"])
	}

	// 2. Verify cache hit on second fetch
	cachedDict, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil {
		t.Fatalf("unexpected error fetching cached dictionary: %v", err)
	}
	if cachedDict != dict {
		t.Errorf("expected cached pointer to be returned, got different reference")
	}

	// 3. Test SaveTranslations increments version and invalidates cache
	newVer, err := service.SaveTranslations(ctx, system_dto.SaveTranslationsRequest{
		LocaleCode: "en-US",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common", Key: "btn.cancel", Value: "Cancel"},
		},
	})
	if err != nil {
		t.Fatalf("unexpected error saving translations: %v", err)
	}
	if newVer != 3 {
		t.Errorf("expected new version 3, got %d", newVer)
	}
	if !txManager.wasCalled {
		t.Errorf("expected txManager.WithTransaction to be executed during SaveTranslations")
	}

	// After save, fetching en-US should return the newly translated value and new composite version (100003)
	updatedDict, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil {
		t.Fatalf("unexpected error fetching updated dictionary: %v", err)
	}
	if updatedDict.Version != 100003 {
		t.Errorf("expected updated composite version 100003, got %d", updatedDict.Version)
	}
	if updatedDict.Entries["common.btn.cancel"] != "Cancel" {
		t.Errorf("expected 'common.btn.cancel' to be 'Cancel', got '%s'", updatedDict.Entries["common.btn.cancel"])
	}
}

func TestLocalizationService_CompositeVersionInvalidation(t *testing.T) {
	repo := newMockRepo()
	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)
	ctx := context.Background()

	// Initial fetch warms the cache with effectiveVersion 100002
	dict1, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil || dict1.Version != 100002 {
		t.Fatalf("initial fetch failed, version=%d", dict1.Version)
	}

	// Simulate external CLI seeder directly bumping id-ID version to 2 in DB WITHOUT calling InvalidateCache
	idLoc := repo.locales["id-ID"]
	idLoc.Version = 2
	repo.locales["id-ID"] = idLoc
	// Also simulate adding a new fallback key to id-ID in DB
	repo.translations["id-ID"] = append(repo.translations["id-ID"], domain.TranslationItem{
		Module: "common",
		Key:    "label.new_feature",
		Value:  "Fitur Baru",
	})

	// Fetching en-US should automatically detect effectiveVersion change (200002 != 100002) and refresh cache!
	dict2, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil {
		t.Fatalf("fetch after DB bump failed: %v", err)
	}

	if dict2.Version != 200002 {
		t.Errorf("expected composite version 200002 after DB bump, got %d", dict2.Version)
	}
	if dict2.Entries["common.label.new_feature"] != "Fitur Baru" {
		t.Errorf("expected newly seeded fallback key 'common.label.new_feature' to be present")
	}
}

func TestLocalizationService_TransactionAndValidation(t *testing.T) {
	repo := newMockRepo()
	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)
	ctx := context.Background()

	// 1. Rejects unknown locale
	_, err := service.SaveTranslations(ctx, system_dto.SaveTranslationsRequest{
		LocaleCode: "fr-FR",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common", Key: "btn.ok", Value: "D'accord"},
		},
	})
	if err == nil {
		t.Errorf("expected error for unregistered locale 'fr-FR', got nil")
	}

	// 2. Rejects invalid key or module identifier
	_, err = service.SaveTranslations(ctx, system_dto.SaveTranslationsRequest{
		LocaleCode: "en-US",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common bad!", Key: "btn.ok", Value: "OK"},
		},
	})
	if err != domain.ErrInvalidTranslationKey {
		t.Errorf("expected ErrInvalidTranslationKey, got %v", err)
	}

	// 3. Transaction error propagates cleanly
	txManager.failTx = true
	_, err = service.SaveTranslations(ctx, system_dto.SaveTranslationsRequest{
		LocaleCode: "en-US",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common", Key: "btn.ok", Value: "OK"},
		},
	})
	if err == nil || err.Error() != "simulated transaction failure" {
		t.Errorf("expected transaction failure error, got: %v", err)
	}
}

type mockEventBus struct {
	events []eventbus.Event
}

func (m *mockEventBus) Publish(ctx context.Context, event eventbus.Event) error {
	m.events = append(m.events, event)
	return nil
}

func (m *mockEventBus) Subscribe(eventType string, handler eventbus.EventHandler) error {
	return nil
}

func (m *mockEventBus) Start(ctx context.Context) error {
	return nil
}

func (m *mockEventBus) Close() error {
	return nil
}

func TestLocalizationService_GetTranslationMatrix(t *testing.T) {
	ctx := context.Background()
	repo := newMockRepo()
	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)

	t.Run("Returns unmasked values and accurate completeness stats", func(t *testing.T) {
		matrix, err := service.GetTranslationMatrix(ctx, system_dto.TranslationMatrixFilter{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if matrix.TotalKeys != 3 {
			t.Errorf("expected 3 total keys, got %d", matrix.TotalKeys)
		}

		// Find btn.cancel row
		var cancelRow *system_dto.TranslationMatrixRow
		for _, r := range matrix.Rows {
			if r.Module == "common" && r.Key == "btn.cancel" {
				cancelRow = &r
				break
			}
		}
		if cancelRow == nil {
			t.Fatalf("expected btn.cancel row to be present")
		}

		// Verify UNMASKED raw values: id-ID is "Batal", en-US is empty string (NOT masked by fallback!)
		if cancelRow.Values["id-ID"] != "Batal" {
			t.Errorf("expected id-ID value 'Batal', got %q", cancelRow.Values["id-ID"])
		}
		if cancelRow.Values["en-US"] != "" {
			t.Errorf("expected en-US value to be empty string, got %q", cancelRow.Values["en-US"])
		}
		if cancelRow.IsComplete {
			t.Errorf("expected btn.cancel to NOT be complete")
		}

		// Verify en-US stats: 2 translated, 1 missing
		var enStat *system_dto.LocaleCompletenessStat
		for _, s := range matrix.Stats {
			if s.LocaleCode == "en-US" {
				enStat = &s
				break
			}
		}
		if enStat == nil || enStat.TranslatedCount != 2 || enStat.MissingCount != 1 {
			t.Errorf("expected en-US stats 2 translated / 1 missing, got %+v", enStat)
		}
	})

	t.Run("MissingOnly filter returns only incomplete rows", func(t *testing.T) {
		matrix, err := service.GetTranslationMatrix(ctx, system_dto.TranslationMatrixFilter{
			MissingOnly: true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if len(matrix.Rows) != 1 {
			t.Fatalf("expected exactly 1 missing row, got %d", len(matrix.Rows))
		}
		if matrix.Rows[0].Key != "btn.cancel" {
			t.Errorf("expected missing row to be btn.cancel, got %s", matrix.Rows[0].Key)
		}
	})
}

func TestLocalizationService_AuditLog(t *testing.T) {
	ctx := context.Background()
	repo := newMockRepo()
	txManager := &mockTxManager{}
	eb := &mockEventBus{}
	service := usecase.NewLocalizationService(repo, txManager, eb)

	audit := system_dto.AuditMetadata{
		UserID:    42,
		IP:        "192.168.1.100",
		UserAgent: "Mozilla/5.0 TestBrowser",
	}

	newVer, err := service.SaveTranslations(ctx, system_dto.SaveTranslationsRequest{
		LocaleCode: "en-US",
		Translations: []system_dto.TranslationInputItem{
			{Module: "common", Key: "btn.cancel", Value: "Cancel"},
		},
	}, audit)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if newVer != 3 {
		t.Errorf("expected incremented version 3, got %d", newVer)
	}

	if len(eb.events) != 1 {
		t.Fatalf("expected 1 audit event published, got %d", len(eb.events))
	}

	evt := eb.events[0]
	if evt.Type != eventbus.EventSystemLog {
		t.Errorf("expected event type %s, got %s", eventbus.EventSystemLog, evt.Type)
	}

	var payload map[string]any
	if err := json.Unmarshal(evt.Payload, &payload); err != nil {
		t.Fatalf("failed to unmarshal audit payload: %v", err)
	}

	if payload["action"] != "UPDATE_LOCALIZATION" {
		t.Errorf("expected action UPDATE_LOCALIZATION, got %v", payload["action"])
	}
	if evt.UserID != 42 {
		t.Errorf("expected evt.UserID 42, got %v", evt.UserID)
	}
}

func TestLocalizationService_ZeroRawQueryOnCacheHitAndBaselineReuse(t *testing.T) {
	ctx := context.Background()
	repo := newMockRepo()
	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)

	// 1. Initial warm up of default baseline 'id-ID'
	dictID, err := service.GetMergedDictionary(ctx, "id-ID")
	if err != nil {
		t.Fatalf("unexpected error fetching id-ID: %v", err)
	}
	if dictID.Locale != "id-ID" {
		t.Errorf("expected id-ID, got %s", dictID.Locale)
	}
	if repo.rawQueryCount["id-ID"] != 1 {
		t.Errorf("expected id-ID raw query count to be 1, got %d", repo.rawQueryCount["id-ID"])
	}

	// 2. Fetch en-US dictionary: it must REUSE cached id-ID without querying id-ID again!
	dictEN, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil {
		t.Fatalf("unexpected error fetching en-US: %v", err)
	}
	if dictEN.Locale != "en-US" {
		t.Errorf("expected en-US, got %s", dictEN.Locale)
	}
	// Verify id-ID was NOT queried again
	if repo.rawQueryCount["id-ID"] != 1 {
		t.Errorf("expected id-ID raw query count to remain 1 after en-US merge, got %d", repo.rawQueryCount["id-ID"])
	}
	// Verify en-US was queried exactly once
	if repo.rawQueryCount["en-US"] != 1 {
		t.Errorf("expected en-US raw query count to be 1, got %d", repo.rawQueryCount["en-US"])
	}

	// 3. Second fetch of en-US: MUST be a total CACHE HIT (0 queries for both locales)
	dictEN2, err := service.GetMergedDictionary(ctx, "en-US")
	if err != nil {
		t.Fatalf("unexpected error on second fetch: %v", err)
	}
	if dictEN2.Version != dictEN.Version {
		t.Errorf("expected matching versions, got %d vs %d", dictEN2.Version, dictEN.Version)
	}
	if repo.rawQueryCount["en-US"] != 1 {
		t.Errorf("expected en-US query count to remain 1 on cache hit, got %d", repo.rawQueryCount["en-US"])
	}
	if repo.rawQueryCount["id-ID"] != 1 {
		t.Errorf("expected id-ID query count to remain 1 on cache hit, got %d", repo.rawQueryCount["id-ID"])
	}
}

func TestLocalizationService_DynamicDefaultLocale(t *testing.T) {
	ctx := context.Background()
	repo := newMockRepo()

	// Switch default locale: set en-US as default (IsDefault: true) and id-ID as non-default
	locEN := repo.locales["en-US"]
	locEN.IsDefault = true
	repo.locales["en-US"] = locEN

	locID := repo.locales["id-ID"]
	locID.IsDefault = false
	repo.locales["id-ID"] = locID

	// In en-US baseline, provide a key 'system.backup' that is NOT present in id-ID
	repo.translations["en-US"] = append(repo.translations["en-US"], domain.TranslationItem{
		Module: "system",
		Key:    "backup",
		Value:  "System Backup",
	})

	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)

	// Fetch id-ID dictionary (now non-default)
	dictID, err := service.GetMergedDictionary(ctx, "id-ID")
	if err != nil {
		t.Fatalf("unexpected error fetching id-ID with en-US as default: %v", err)
	}

	// The missing key 'system.backup' in id-ID must fall back to the dynamic default 'en-US' value
	if dictID.Entries["system.backup"] != "System Backup" {
		t.Errorf("expected dynamic fallback to en-US 'System Backup', got '%s'", dictID.Entries["system.backup"])
	}

	// Overridden key 'common.btn.save' should still be Indonesian 'Simpan'
	if dictID.Entries["common.btn.save"] != "Simpan" {
		t.Errorf("expected 'common.btn.save' to be 'Simpan', got '%s'", dictID.Entries["common.btn.save"])
	}
}

func TestLocalizationService_ConcurrentCacheStampede(t *testing.T) {
	ctx := context.Background()
	repo := newMockRepo()
	txManager := &mockTxManager{}
	service := usecase.NewLocalizationService(repo, txManager)

	const concurrency = 20
	var wg sync.WaitGroup
	errCh := make(chan error, concurrency)

	// Launch 20 concurrent readers on a cold cache
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			dict, err := service.GetMergedDictionary(ctx, "en-US")
			if err != nil {
				errCh <- err
				return
			}
			if dict.Entries["common.btn.save"] != "Save" {
				errCh <- errors.New("unexpected translation value during concurrent read")
				return
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Fatalf("concurrent execution encountered error: %v", err)
	}

	// Under in-flight coalescing lock (buildMu), en-US must be queried exactly 1 time
	if repo.rawQueryCount["en-US"] != 1 {
		t.Errorf("expected coalesced build with 1 raw query for en-US, got %d", repo.rawQueryCount["en-US"])
	}
	// And baseline id-ID must be queried exactly 1 time
	if repo.rawQueryCount["id-ID"] != 1 {
		t.Errorf("expected 1 baseline raw query for id-ID, got %d", repo.rawQueryCount["id-ID"])
	}
}


