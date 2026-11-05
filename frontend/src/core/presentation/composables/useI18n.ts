import { computed } from 'vue'
import { useLocaleStore } from '@/core/presentation/stores/localeStore'
import { DEFAULT_LOCALE, DEFAULT_USER_PREFERENCES } from '@/core/domain/localization.types'

const warnedMissingKeys = new Set<string>()

function formatSafeDate(
  targetDate: Date,
  locale: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  let finalOpts: Intl.DateTimeFormatOptions
  if (options) {
    if (options.dateStyle || options.timeStyle) {
      // ECMA-402: dateStyle/timeStyle cannot be combined with year, month, or day
      finalOpts = { timeZone, ...options }
    } else {
      finalOpts = {
        timeZone,
        year: options.year ?? 'numeric',
        month: options.month ?? 'short',
        day: options.day ?? '2-digit',
        ...options
      }
    }
  } else {
    finalOpts = { timeZone, year: 'numeric', month: 'short', day: '2-digit' }
  }

  try {
    return new Intl.DateTimeFormat(locale, finalOpts).format(targetDate)
  } catch {
    try {
      const fallbackOpts = { ...finalOpts, timeZone: DEFAULT_USER_PREFERENCES.timezone }
      return new Intl.DateTimeFormat(DEFAULT_LOCALE, fallbackOpts).format(targetDate)
    } catch {
      try {
        return targetDate.toISOString().split('T')[0]
      } catch {
        return String(targetDate)
      }
    }
  }
}

function getSafeDateParts(
  targetDate: Date,
  locale: string,
  timeZone: string,
  monthFormat: 'short' | '2-digit'
): Record<string, string> {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    year: 'numeric',
    month: monthFormat,
    day: '2-digit'
  }
  try {
    const parts = new Intl.DateTimeFormat(locale, opts).formatToParts(targetDate)
    return Object.fromEntries(parts.map(p => [p.type, p.value]))
  } catch {
    try {
      const fallbackOpts = { ...opts, timeZone: DEFAULT_USER_PREFERENCES.timezone }
      const parts = new Intl.DateTimeFormat(DEFAULT_LOCALE, fallbackOpts).formatToParts(targetDate)
      return Object.fromEntries(parts.map(p => [p.type, p.value]))
    } catch {
      const y = String(targetDate.getFullYear())
      const m = String(targetDate.getMonth() + 1).padStart(2, '0')
      const d = String(targetDate.getDate()).padStart(2, '0')
      return { year: y, month: m, day: d }
    }
  }
}

export function useI18n() {
  const store = useLocaleStore()

  /**
   * Mengambil teks terjemahan dan menyisipkan parameter dinamis.
   * Mendukung defaultValue jika key belum terdaftar di kamus.
   */
  const t = (key: string, params?: Record<string, string | number>, defaultValue?: string): string => {
    const raw = store.dictionary[key]
    if (raw === undefined) {
      if (import.meta.env.DEV && store.isInitialized && !store.isLoading && !warnedMissingKeys.has(key)) {
        warnedMissingKeys.add(key)
        console.warn(`[I18N Missing Key] Key "${key}" not found in locale "${store.currentLocale}"`)
      }
    }
    let text = raw ?? defaultValue ?? key
    if (params) {
      for (const [paramKey, val] of Object.entries(params)) {
        // Gunakan replacer function agar karakter '$' pada val tidak dianggap pattern regex/string substitution
        text = text.replaceAll(`{${paramKey}}`, () => String(val))
      }
    }
    return text
  }

  /**
   * Pemformatan tanggal regional terpusat menggunakan zona waktu dan format tanggal user.
   * Dilengkapi penanganan tabrakan opsi ECMA-402 dan fallback defensif terhadap timezone/locale tidak valid.
   */
  const d = (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
    if (!date) return ''
    const targetDate = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
    if (isNaN(targetDate.getTime())) return String(date)

    const timeZone = store.preferences?.timezone || DEFAULT_USER_PREFERENCES.timezone
    const locale = store.currentLocale || DEFAULT_LOCALE

    if (options) {
      return formatSafeDate(targetDate, locale, timeZone, options)
    }

    const pattern = store.preferences?.date_format || DEFAULT_USER_PREFERENCES.date_format
    if (pattern === 'DD MMM YYYY') {
      const map = getSafeDateParts(targetDate, locale, timeZone, 'short')
      return `${map.day} ${map.month} ${map.year}`
    }

    if (pattern === 'DD/MM/YYYY') {
      const numMap = getSafeDateParts(targetDate, 'en-US', timeZone, '2-digit')
      return `${numMap.day}/${numMap.month}/${numMap.year}`
    }

    const isoMap = getSafeDateParts(targetDate, 'en-US', timeZone, '2-digit')
    return `${isoMap.year}-${isoMap.month}-${isoMap.day}`
  }

  /**
   * Pemformatan angka dan mata uang regional terpusat dengan fallback defensif.
   */
  const n = (number: number, options?: Intl.NumberFormatOptions): string => {
    if (typeof number !== 'number' || isNaN(number)) return '0'
    const locale = store.currentLocale || 'id-ID'
    try {
      return new Intl.NumberFormat(locale, options).format(number)
    } catch {
      try {
        return new Intl.NumberFormat('id-ID', options).format(number)
      } catch {
        return String(number)
      }
    }
  }

  return {
    t,
    d,
    n,
    currentLocale: computed(() => store.currentLocale),
    availableLocales: computed(() => store.availableLocales),
    preferences: computed(() => store.preferences),
    isLoading: computed(() => store.isLoading),
    setLocale: store.setLocale,
    initLocale: store.initLocale
  }
}
