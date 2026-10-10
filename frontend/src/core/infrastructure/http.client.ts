import axios, { type InternalAxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useLoadingStore } from '@/stores/loadingStore'
import type { ApiResponse } from '../domain/api.types'

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const loadingStore = useLoadingStore()
    loadingStore.startLoading()

    if (config.data instanceof FormData || config.responseType === 'blob') {
      config.timeout = 80000
    }

    return config
  },
  (error: AxiosError) => {
    const loadingStore = useLoadingStore()
    loadingStore.stopLoading()
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  (response: AxiosResponse) => {
    const loadingStore = useLoadingStore()
    loadingStore.stopLoading()
    return response
  },
  async (error: AxiosError<any>) => {
    const authStore = useAuthStore()
    const loadingStore = useLoadingStore()
    const { toast } = await import('@/composables/useToast').then(m => m.useToast())

    loadingStore.stopLoading()

    if (error.response) {
      const { status, data } = error.response
      const url = error.config?.url || ''

      if (status === 401 && !url.includes('/auth/login')) {
        authStore.logout()
        toast('Sesi Anda telah habis, silakan login kembali.', 'error')
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      } else if (status === 403) {
        toast(data?.message || 'Akses ditolak.', 'warning')
      } else if (status >= 400 && status !== 401 && status !== 403) {
        if (!url.includes('/auth/login')) {
          let serverMessage = data?.message || 'Terjadi kesalahan pada server.'
          if (data?.error_code === 'VALIDATION_ERROR' && data?.message) {
            serverMessage = serverMessage.replace(/(body\.|query\.|params\.)/g, '')
            data.message = serverMessage 
          }
          toast(serverMessage, 'error')
        }
      }
    } else {
      toast('Tidak dapat terhubung ke server (Network Error).', 'error')
    }

    return Promise.reject(error)
  }
)

export const http = {
  get: <T = any>(url: string, config?: any): Promise<ApiResponse<T>> => instance.get(url, config).then(res => res.data),
  post: <T = any>(url: string, data?: any, config?: any): Promise<ApiResponse<T>> => instance.post(url, data, config).then(res => res.data),
  put: <T = any>(url: string, data?: any, config?: any): Promise<ApiResponse<T>> => instance.put(url, data, config).then(res => res.data),
  delete: <T = any>(url: string, config?: any): Promise<ApiResponse<T>> => instance.delete(url, config).then(res => res.data)
}

export default instance
