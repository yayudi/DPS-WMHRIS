import { http } from '@/core/infrastructure/http.client'
import type { ApiResponse } from '@/core/domain/api.types'
import type { LoginPayload, LoginRawResponse } from '../domain/auth.types'
import type { AuthUser } from '../domain/user.entity'
import type { UserPreference, UpdatePreferencePayload } from '@/core/domain/localization.types'

/**
 * Auth API Repository
 * 
 * Mengenkapsulasi semua pemanggilan HTTP eksternal yang berhubungan dengan Modul Otentikasi.
 * Ini memastikan komponen UI tidak perlu tahu tentang path endpoint atau axios.
 */
export const authApi = {
  /**
   * Mengirim kredensial login ke server
   */
  login(payload: LoginPayload): Promise<LoginRawResponse> {
    return http.post<LoginRawResponse>('/auth/login', payload) as unknown as Promise<LoginRawResponse>
  },

  /**
   * Mengambil profil data user yang sedang login saat ini (lewat session/cookie backend)
   */
  getProfile(): Promise<ApiResponse<AuthUser>> {
    return http.get<AuthUser>('/user/profile')
  },

  /**
   * Memperbarui profil akun user saat ini
   */
  updateProfile(payload: { nickname?: string; password?: string }): Promise<ApiResponse<any>> {
    return http.put('/user/profile', payload)
  },

  /**
   * Mengambil data preferensi regional & UI user saat ini
   */
  getPreferences(): Promise<ApiResponse<UserPreference>> {
    return http.get<UserPreference>('/user/preferences')
  },

  /**
   * Memperbarui data preferensi user saat ini (locale, theme, timezone, date_format)
   */
  updatePreferences(payload: UpdatePreferencePayload): Promise<ApiResponse<UserPreference>> {
    return http.patch<UserPreference>('/user/preferences', payload)
  },

  /**
   * Ping server untuk memeriksa konektivitas jaringan/server (dipakai di halaman Login)
   */
  testConnection(): Promise<ApiResponse<any>> {
    return http.get('/test')
  }
}
