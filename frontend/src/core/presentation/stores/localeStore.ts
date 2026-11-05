import { defineStore } from 'pinia'
import { ref } from 'vue'
import { localizationApi } from '@/core/infrastructure/localization.api'
import { authApi } from '@/modules/auth/infrastructure/auth.api'
import { getBaselineDictionary } from '@/core/domain/defaultDictionaries'
import { DEFAULT_LOCALE, type LocaleItem, type UserPreference } from '@/core/domain/localization.types'

function getInitialLocale(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
  return localStorage.getItem('user_locale') || DEFAULT_LOCALE
}

function loadCachedDictionary(locale: string): Record<string, string> {
  const baseline = getBaselineDictionary(locale)
  if (typeof localStorage === 'undefined') return { ...baseline }
  try {
    const raw = localStorage.getItem(`cached_dict_${locale}`)
    const parsed = raw ? JSON.parse(raw) : {}
    return { ...baseline, ...parsed }
  } catch {
    return { ...baseline }
  }
}

function getInitialPreferences(): UserPreference | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem('user_preferences')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useLocaleStore = defineStore('locale', () => {
  const currentLocale = ref<string>(getInitialLocale())
  const dictionary = ref<Record<string, string>>(loadCachedDictionary(currentLocale.value))
  const availableLocales = ref<LocaleItem[]>([
    { code: 'id-ID', name: 'Bahasa Indonesia', is_default: true, version: 1 },
    { code: 'en-US', name: 'English', is_default: false, version: 1 }
  ])
  const preferences = ref<UserPreference | null>(getInitialPreferences())
  const isLoading = ref<boolean>(false)
  const isInitialized = ref<boolean>(false)

  const inFlightRequests = new Map<string, Promise<void>>()
  let activeFetchCount = 0

  /**
   * Mengambil kamus terjemahan dari API dengan dukungan HTTP ETag (304 Not Modified).
   * Dilengkapi in-flight deduplication dan stale-request guard untuk mencegah race condition.
   */
  async function fetchDictionary(locale: string): Promise<void> {
    const existing = inFlightRequests.get(locale)
    if (existing) return existing

    const task = (async () => {
      const cachedETag = typeof localStorage !== 'undefined' ? localStorage.getItem(`cached_dict_etag_${locale}`) || undefined : undefined
      activeFetchCount++
      isLoading.value = true

      try {
        const res = await localizationApi.getDictionary(locale, cachedETag)
        if (res.data && res.data.entries) {
          const merged = { ...getBaselineDictionary(locale), ...res.data.entries }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`cached_dict_${locale}`, JSON.stringify(merged))
            if (res.eTag) {
              localStorage.setItem(`cached_dict_etag_${locale}`, res.eTag)
            }
          }
          // GUARD: Hanya pasang ke state aktif jika bahasa masih sesuai dengan currentLocale
          if (currentLocale.value === locale) {
            dictionary.value = merged
          }
        } else if (res.notModified && currentLocale.value === locale) {
          dictionary.value = loadCachedDictionary(locale)
        }
      } catch (err) {
        console.warn(`[I18N] Failed to fetch dictionary for '${locale}':`, err)
      } finally {
        inFlightRequests.delete(locale)
        activeFetchCount = Math.max(0, activeFetchCount - 1)
        isLoading.value = activeFetchCount > 0
      }
    })()

    inFlightRequests.set(locale, task)
    return task
  }

  /**
   * Mengambil daftar seluruh bahasa yang tersedia dari backend.
   */
  async function fetchLocales(): Promise<void> {
    try {
      const res = await localizationApi.getActiveLocales()
      if (res.data && res.data.length > 0) {
        availableLocales.value = res.data
      }
    } catch (err) {
      console.warn('[I18N] Failed to fetch available locales:', err)
    }
  }

  /**
   * Menginisialisasi katalog bahasa dan memvalidasi kamus saat aplikasi dibuka.
   */
  async function initLocale(): Promise<void> {
    if (isInitialized.value) return
    isInitialized.value = true

    await Promise.all([
      fetchLocales(),
      fetchDictionary(currentLocale.value)
    ])
  }

  /**
   * Mengubah bahasa aktif secara reaktif dan menyinkronkannya ke penyimpanan lokal & basis data.
   */
  async function setLocale(newLocale: string, syncBackend: boolean = true): Promise<void> {
    if (!newLocale || newLocale === currentLocale.value) return

    currentLocale.value = newLocale
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('user_locale', newLocale)
    }

    // Segera tampilkan teks dari baseline + cache lokal untuk mencegah FOIT
    dictionary.value = loadCachedDictionary(newLocale)

    // Ambil versi terbaru dari server (stale guard memastikan hanya currentLocale yang terpasang)
    await fetchDictionary(newLocale)

    if (preferences.value) {
      preferences.value.locale = newLocale
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('user_preferences', JSON.stringify(preferences.value))
      }
    }

    // Sinkronisasi ke backend hanya jika dipicu oleh aksi perubahan user (bukan hidrasi awal)
    if (syncBackend) {
      try {
        await authApi.updatePreferences({ locale: newLocale })
      } catch {
        // Abaikan jika user belum terautentikasi (guest)
      }
    }
  }

  /**
   * Menyelaraskan preferensi dari profil pengguna saat sesi login aktif.
   */
  function syncUserPreferences(pref?: UserPreference): void {
    if (!pref) return
    preferences.value = pref
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('user_preferences', JSON.stringify(pref))
    }
    if (pref.locale && pref.locale !== currentLocale.value) {
      void setLocale(pref.locale, false)
    }
  }

  /**
   * Mereset state preferensi pengguna saat logout.
   */
  function resetPreferences(): void {
    preferences.value = null
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('user_preferences')
    }
  }

  return {
    currentLocale,
    dictionary,
    availableLocales,
    preferences,
    isLoading,
    isInitialized,
    initLocale,
    fetchDictionary,
    fetchLocales,
    setLocale,
    syncUserPreferences,
    resetPreferences
  }
})
