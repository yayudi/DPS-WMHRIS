import { http } from '@/core/infrastructure/http.client'
import type { ApiResponse } from '@/core/domain/api.types'
import type { LocaleItem, DictionaryData, TranslationMatrixResponse, TranslationMatrixFilter } from '@/core/domain/localization.types'

export const localizationApi = {
  /**
   * Mengambil daftar seluruh bahasa yang aktif di sistem.
   */
  getActiveLocales(): Promise<ApiResponse<LocaleItem[]>> {
    return http.get<LocaleItem[]>('/system/localization/locales')
  },

  /**
   * Endpoint Admin: Mengambil matriks translasi lengkap lintas bahasa dengan nilai asli (unmasked).
   */
  getTranslationMatrix(filter?: TranslationMatrixFilter): Promise<ApiResponse<TranslationMatrixResponse>> {
    return http.get<TranslationMatrixResponse>('/system/localization/admin/matrix', {
      params: filter
    })
  },

  /**
   * Mengambil kamus terjemahan untuk locale tertentu.
   * Mendukung validasi ETag untuk mendapatkan respons 304 Not Modified.
   */
  async getDictionary(
    locale: string,
    eTag?: string
  ): Promise<{ data?: DictionaryData; notModified: boolean; eTag?: string }> {
    try {
      const headers: Record<string, string> = {}
      if (eTag) {
        headers['If-None-Match'] = eTag
      }

      const response = await http.get<DictionaryData>(
        `/system/localization/dictionaries/${locale}`,
        {
          headers,
          validateStatus: (status: number) => (status >= 200 && status < 300) || status === 304
        }
      )

      if (!response || !response.data) {
        return { notModified: true, eTag }
      }

      const resolvedETag = `W/"v${response.data.version}-${response.data.locale}"`
      return {
        data: response.data,
        notModified: false,
        eTag: resolvedETag
      }
    } catch (err) {
      console.warn(`[I18N] Failed to fetch dictionary for locale '${locale}', fallback to local cache:`, err)
      return { notModified: true, eTag }
    }
  },

  /**
   * Endpoint Admin: Menyimpan pembaharuan kamus massal dan menaikkan versi.
   */
  saveTranslations(payload: {
    locale_code: string
    translations: Array<{ module: string; translation_key: string; translation_value: string }>
  }): Promise<ApiResponse<{ locale: string; version: number }>> {
    return http.post('/system/localization/translations', payload)
  }
}

