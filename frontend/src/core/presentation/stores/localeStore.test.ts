import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLocaleStore } from './localeStore'
import { localizationApi } from '@/core/infrastructure/localization.api'
import { authApi } from '@/modules/auth/infrastructure/auth.api'

const storage: Record<string, string> = {}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = String(val) },
    removeItem: (key: string) => { delete storage[key] },
    clear: () => { for (const k in storage) delete storage[k] },
    key: (i: number) => Object.keys(storage)[i] || null,
    length: 0
  } as any
}

vi.mock('@/core/infrastructure/localization.api', () => ({
  localizationApi: {
    getActiveLocales: vi.fn(),
    getDictionary: vi.fn()
  }
}))

vi.mock('@/modules/auth/infrastructure/auth.api', () => ({
  authApi: {
    updatePreferences: vi.fn()
  }
}))

describe('localeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('initializes with default locale id-ID and loads local cache if present', () => {
    localStorage.setItem('user_locale', 'en-US')
    localStorage.setItem('cached_dict_en-US', JSON.stringify({ 'common.btn.save': 'Save' }))

    const store = useLocaleStore()
    expect(store.currentLocale).toBe('en-US')
    expect(store.dictionary['common.btn.save']).toBe('Save')
  })

  it('updates locale, saves to localStorage, and updates preferences', async () => {
    vi.mocked(localizationApi.getDictionary).mockResolvedValueOnce({
      data: {
        locale: 'en-US',
        version: 2,
        entries: { 'common.btn.save': 'Save' }
      },
      notModified: false,
      eTag: 'W/v2-en-US'
    })

    const store = useLocaleStore()
    store.preferences = {
      user_id: 1,
      locale: 'id-ID',
      theme: 'light',
      timezone: 'Asia/Jakarta',
      date_format: 'YYYY-MM-DD'
    }

    await store.setLocale('en-US')

    expect(store.currentLocale).toBe('en-US')
    expect(localStorage.getItem('user_locale')).toBe('en-US')
    expect(store.dictionary['common.btn.save']).toBe('Save')
    expect(authApi.updatePreferences).toHaveBeenCalledWith({ locale: 'en-US' })
  })

  it('syncs user preferences correctly when user logs in without redundant backend PATCH', async () => {
    vi.mocked(localizationApi.getDictionary).mockResolvedValueOnce({
      data: {
        locale: 'en-US',
        version: 2,
        entries: { 'common.btn.save': 'Save' }
      },
      notModified: false,
      eTag: 'W/v2-en-US'
    })

    const store = useLocaleStore()
    store.currentLocale = 'id-ID'

    const pref = {
      user_id: 5,
      locale: 'en-US',
      theme: 'dark',
      timezone: 'Asia/Makassar',
      date_format: 'DD/MM/YYYY'
    }

    store.syncUserPreferences(pref)

    expect(store.preferences).toEqual(pref)
    expect(store.currentLocale).toBe('en-US')
    // Crucial: authApi.updatePreferences must NOT be triggered during hydration
    expect(authApi.updatePreferences).not.toHaveBeenCalled()
  })

  it('resets user preferences when resetPreferences is called', () => {
    const store = useLocaleStore()
    store.preferences = {
      user_id: 5,
      locale: 'en-US',
      theme: 'dark',
      timezone: 'Asia/Makassar',
      date_format: 'DD/MM/YYYY'
    }

    store.resetPreferences()
    expect(store.preferences).toBeNull()
  })

  it('provides bundled baseline dictionary on cold start when localStorage is empty (Zero-FOUK)', () => {
    const store = useLocaleStore()
    expect(store.dictionary['common.btn.save']).toBe('Simpan')
    expect(store.dictionary['nav.wms']).toBe('WMS')
    expect(store.dictionary['common.btn.cancel']).toBe('Batal')
  })

  it('ignores stale response when user changes locale during slow fetch (Race Condition Guard)', async () => {
    let resolveSlowId: (val: any) => void = () => {}
    const slowIdPromise = new Promise(resolve => {
      resolveSlowId = resolve
    })

    // Mock first call (id-ID) to hang until we manually resolve it
    vi.mocked(localizationApi.getDictionary).mockReturnValueOnce(slowIdPromise as any)

    const store = useLocaleStore()
    store.currentLocale = 'id-ID'

    // 1. Trigger slow fetch for id-ID in background
    const task1 = store.fetchDictionary('id-ID')

    // 2. User quickly switches to en-US
    vi.mocked(localizationApi.getDictionary).mockResolvedValueOnce({
      data: {
        locale: 'en-US',
        version: 5,
        entries: { 'common.btn.save': 'Save (English)' }
      },
      notModified: false,
      eTag: 'W/v5-en-US'
    })
    await store.setLocale('en-US', false)

    expect(store.currentLocale).toBe('en-US')
    expect(store.dictionary['common.btn.save']).toBe('Save (English)')

    // 3. Now the slow id-ID request finally resolves later
    resolveSlowId({
      data: {
        locale: 'id-ID',
        version: 1,
        entries: { 'common.btn.save': 'Simpan (Indonesian Old)' }
      },
      notModified: false,
      eTag: 'W/v1-id-ID'
    })
    await task1

    // 4. Stale guard MUST prevent overwriting active en-US dictionary
    expect(store.currentLocale).toBe('en-US')
    expect(store.dictionary['common.btn.save']).toBe('Save (English)')
  })
})
