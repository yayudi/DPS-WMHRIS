import axios, {
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
  type AxiosRequestConfig
} from 'axios'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useLoadingStore } from '@/core/presentation/stores/loadingStore'
import type { ApiResponse } from '../domain/api.types'

declare module 'axios' {
  export interface AxiosRequestConfig {
    silentErrorToast?: boolean
  }
  export interface InternalAxiosRequestConfig {
    silentErrorToast?: boolean
  }
}

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
    if (getActivePinia()) {
      const loadingStore = useLoadingStore()
      loadingStore.startLoading()
    }

    if (config.data instanceof FormData || config.responseType === 'blob') {
      config.timeout = 80000
    }

    return config
  },
  (error: AxiosError) => {
    if (getActivePinia()) {
      const loadingStore = useLoadingStore()
      loadingStore.stopLoading()
    }
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  async (response: AxiosResponse) => {
    if (getActivePinia()) {
      const loadingStore = useLoadingStore()
      loadingStore.stopLoading()
    }

    if (response.config.responseType !== 'blob' && response.data && typeof response.data === 'object') {
      if (response.data.success === false) {
        const message = response.data.message || 'Operasi gagal diproses oleh server.'
        if (!response.config?.silentErrorToast) {
          const { toast } = await import('@/core/presentation/composables/useToast').then(m => m.useToast())
          toast(message, 'error')
        }
        return Promise.reject(new Error(message))
      }
    }

    return response
  },
  async (error: AxiosError<any>) => {
    let authStore: ReturnType<typeof useAuthStore> | null = null
    if (getActivePinia()) {
      authStore = useAuthStore()
      const loadingStore = useLoadingStore()
      loadingStore.stopLoading()
    }
    const { toast } = await import('@/core/presentation/composables/useToast').then(m => m.useToast())

    if (error.response) {
      const { status, data } = error.response
      const url = error.config?.url || ''

      if (status === 401 && !url.includes('/auth/login')) {
        if (authStore) {
          authStore.logout()
        }
        if (!error.config?.silentErrorToast) {
          toast('Sesi Anda telah habis, silakan login kembali.', 'error')
        }
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      } else if (status === 403) {
        if (!error.config?.silentErrorToast) {
          toast(data?.message || 'Akses ditolak.', 'warning')
        }
      } else if (status >= 400 && status !== 401 && status !== 403) {
        if (!url.includes('/auth/login')) {
          let serverMessage = data?.message || 'Terjadi kesalahan pada server.'
          if (data?.error_code === 'VALIDATION_ERROR' && data?.message) {
            serverMessage = serverMessage.replace(/(body\.|query\.|params\.)/g, '')
            data.message = serverMessage 
          }
          if (!error.config?.silentErrorToast) {
            toast(serverMessage, 'error')
          }
        }
      }
    } else {
      if (!error.config?.silentErrorToast) {
        toast('Tidak dapat terhubung ke server (Network Error).', 'error')
      }
    }

    return Promise.reject(error)
  }
)

export const http = {
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    instance.get(url, config).then(res => res.data),
  post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    instance.post(url, data, config).then(res => res.data),
  put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    instance.put(url, data, config).then(res => res.data),
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    instance.delete(url, config).then(res => res.data),
  blob: (url: string, config?: AxiosRequestConfig): Promise<Blob> =>
    instance.get(url, { ...config, responseType: 'blob' }).then(res => res.data),
  upload: <T = any>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    instance.post(url, formData, {
      ...config,
      headers: {
        ...(config?.headers || {}),
        'Content-Type': 'multipart/form-data'
      }
    }).then(res => res.data)
}

/**
 * @deprecated Gunakan named export { http } untuk unwrap res.data otomatis dan type safety.
 */
export default instance
