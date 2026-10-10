import { http } from '@/core/infrastructure/http.client'
import type { ApiResponse } from '@/core/domain/api.types'
import type { LoginPayload, LoginRawResponse } from '../domain/auth.types'
import type { AuthUser } from '../domain/user.entity'
import axios from '@/core/infrastructure/http.client'

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
    return axios.post<LoginRawResponse>('/auth/login', payload).then(res => res.data)
  },

  /**
   * Mengambil profil data user yang sedang login saat ini (lewat session/cookie backend)
   */
  getProfile(): Promise<ApiResponse<AuthUser>> {
    return http.get<AuthUser>('/user/profile')
  },

  /**
   * Ping server untuk memeriksa konektivitas jaringan/server (dipakai di halaman Login)
   */
  testConnection(): Promise<ApiResponse<any>> {
    return http.get('/test')
  }
}
