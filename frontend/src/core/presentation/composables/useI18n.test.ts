import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useI18n } from './useI18n'
import { useLocaleStore } from '../stores/localeStore'

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

describe('useI18n composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('translates existing keys from store dictionary', () => {
    const store = useLocaleStore()
    store.dictionary = {
      'common.btn.save': 'Simpan',
      'common.btn.cancel': 'Batal'
    }

    const { t } = useI18n()
    expect(t('common.btn.save')).toBe('Simpan')
    expect(t('common.btn.cancel')).toBe('Batal')
  })

  it('falls back to raw key if key is missing', () => {
    const { t } = useI18n()
    expect(t('unknown.key.item')).toBe('unknown.key.item')
    expect(t('unknown.key.item', undefined, 'Fallback Label')).toBe('Fallback Label')
  })

  it('performs dynamic parameter interpolation safely', () => {
    const store = useLocaleStore()
    store.dictionary = {
      'wms.alert.picked': 'Telah diambil {picked} dari {total} unit',
      'price.display': 'Harga barang adalah {price}'
    }

    const { t } = useI18n()
    expect(t('wms.alert.picked', { picked: 5, total: 20 })).toBe('Telah diambil 5 dari 20 unit')

    // Test safety against '$' symbol glitch in JavaScript replace
    expect(t('price.display', { price: '$100.00' })).toBe('Harga barang adalah $100.00')
    expect(t('price.display', { price: '$& $1 $' })).toBe('Harga barang adalah $& $1 $')
  })

  it('formats dates according to preferences.date_format and timezone', () => {
    const store = useLocaleStore()
    store.currentLocale = 'id-ID'
    store.preferences = {
      user_id: 1,
      locale: 'id-ID',
      theme: 'light',
      timezone: 'Asia/Jakarta',
      date_format: 'YYYY-MM-DD'
    }

    const { d } = useI18n()
    const testDate = new Date('2026-11-03T10:00:00Z')

    // 1. Pattern YYYY-MM-DD
    expect(d(testDate)).toBe('2026-11-03')

    // 2. Pattern DD/MM/YYYY
    store.preferences.date_format = 'DD/MM/YYYY'
    expect(d(testDate)).toBe('03/11/2026')

    // 3. Pattern DD MMM YYYY
    store.preferences.date_format = 'DD MMM YYYY'
    expect(d(testDate)).toMatch(/03\s+Nov\s+2026/i)

    // 4. Timezone shift: 20:00 UTC on 03 Nov is 03:00 on 04 Nov in Asia/Jakarta (UTC+7)
    const nightDate = new Date('2026-11-03T20:00:00Z')
    store.preferences.date_format = 'YYYY-MM-DD'
    expect(d(nightDate)).toBe('2026-11-04')

    // 5. Custom options override
    const customFormatted = d(testDate, { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit' })
    expect(customFormatted).toContain('2026')
    expect(customFormatted).toContain('Nov')
    expect(d(null as any)).toBe('')
  })

  it('formats numbers and currencies using n() helper', () => {
    const store = useLocaleStore()
    store.currentLocale = 'en-US'

    const { n } = useI18n()
    const formattedNum = n(1234567.89)
    expect(formattedNum).toBe('1,234,567.89')
    expect(n(NaN)).toBe('0')
  })

  it('is crash-proof when d() receives dateStyle/timeStyle or corrupted timezone/locale', () => {
    const store = useLocaleStore()
    const { d } = useI18n()
    const testDate = new Date('2026-11-04T12:00:00Z')

    // 1. ECMA-402: dateStyle option alone (must not throw TypeError)
    expect(() => d(testDate, { dateStyle: 'full' })).not.toThrow()
    const formattedDateStyle = d(testDate, { dateStyle: 'short' })
    expect(formattedDateStyle).toBeTruthy()

    // 2. Corrupted timezone string in user preferences (must not throw RangeError)
    store.preferences = {
      user_id: 1,
      locale: 'id-ID',
      theme: 'light',
      timezone: 'INVALID_CORRUPTED_TIMEZONE',
      date_format: 'YYYY-MM-DD'
    }
    expect(() => d(testDate)).not.toThrow()
    const fallbackFormatted = d(testDate)
    expect(fallbackFormatted).toContain('2026')

    // 3. Corrupted locale string (must not throw RangeError)
    store.currentLocale = 'bad_locale_$$'
    expect(() => d(testDate)).not.toThrow()
  })

  it('is crash-proof when n() receives invalid options or locale', () => {
    const store = useLocaleStore()
    const { n } = useI18n()

    // Corrupted locale
    store.currentLocale = 'bad_locale_$$'
    expect(() => n(9999)).not.toThrow()
    expect(n(9999)).toContain('9')

    // Invalid currency option (must not throw uncaught RangeError)
    expect(() => n(500, { style: 'currency', currency: 'INVALID_CURR' as any })).not.toThrow()
  })
})
