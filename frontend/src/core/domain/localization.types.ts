export const DEFAULT_LOCALE = 'id-ID'

export const DEFAULT_USER_PREFERENCES: Readonly<UserPreference> = Object.freeze({
  user_id: 0,
  locale: DEFAULT_LOCALE,
  theme: 'light',
  timezone: 'Asia/Jakarta',
  date_format: 'YYYY-MM-DD',
})

export interface LocaleItem {
  code: string
  name: string
  is_default: boolean
  version: number
}

export interface DictionaryData {
  locale: string
  version: number
  entries: Record<string, string>
}

export interface UserPreference {
  user_id: number
  locale: string
  theme: string
  timezone: string
  date_format: string
  created_at?: string
  updated_at?: string
}

export interface UpdatePreferencePayload {
  locale?: string
  theme?: string
  timezone?: string
  date_format?: string
}

export interface TranslationMatrixRow {
  module: string
  translation_key: string
  values: Record<string, string>
  is_complete: boolean
}

export interface LocaleCompletenessStat {
  locale_code: string
  translated_count: number
  missing_count: number
  percentage: number
}

export interface TranslationMatrixFilter {
  module?: string
  search?: string
  missing_only?: boolean
}

export interface TranslationMatrixResponse {
  locales: LocaleItem[]
  modules: string[]
  total_keys: number
  stats: LocaleCompletenessStat[]
  rows: TranslationMatrixRow[]
}

