// frontend\src\api\axios.js
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { useLoadingStore } from '@/stores/loadingStore'

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000, // Timeout dalam 30 detik untuk shared hosting
  withCredentials: true, // Untuk HttpOnly cookies
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * REQUEST INTERCEPTOR
 * Menyisipkan token otomatis ke setiap request keluar.
 */
instance.interceptors.request.use(
  config => {
    const loadingStore = useLoadingStore()

    loadingStore.startLoading()

    // Sisipkan Bearer token otomatis (menghindari pemblokiran cookie cross-site di browser)
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // --- AUTO TIMEOUT OVERRIDE ---
    // Jika payload adalah FormData (Upload File) atau response diharapkan Blob (Download File)
    // Perpanjang timeout menjadi 60 detik (60000 ms) agar tidak putus di tengah jalan.
    if (config.data instanceof FormData || config.responseType === 'blob') {
      config.timeout = 80000
    }

    return config
  },
  error => {
    const loadingStore = useLoadingStore()
    loadingStore.stopLoading()
    return Promise.reject(error)
  }
)

/**
 * RESPONSE INTERCEPTOR (Refactored)
 * Menangkap error global, khususnya saat token kadaluwarsa (401/403).
 */
instance.interceptors.response.use(
  response => {
    const loadingStore = useLoadingStore()
    loadingStore.stopLoading()
    return response
  },
  async error => {
    const authStore = useAuthStore()
    const loadingStore = useLoadingStore()
    const { toast } = await import('@/composables/useToast.js').then(m => m.useToast())

    loadingStore.stopLoading()

    if (error.response) {
      const { status, data } = error.response

      // Token Expired / Tidak Valid (401)
      // -> HANYA Logout jika statusnya 401 dan BUKAN request dari login
      if (status === 401 && !error.config.url.includes('/auth/login')) {
        authStore.logout()
        toast('Sesi Anda telah habis, silakan login kembali.', 'error')
        setTimeout(() => {
          window.location.href = '/login'
        }, 2000)
      }
      // Tidak Punya Izin (403)
      // -> JANGAN Logout, tapi beri tahu user
      else if (status === 403) {
        toast(data?.message || 'Akses ditolak.', 'warning')
      }
      // Global Error Handler untuk Server Error atau Bad Request
      else if (status >= 400 && status !== 401 && status !== 403) {
        // Abaikan endpoint login karena biasanya login page punya penanganan error spesifik di komponennya
        if (!error.config.url.includes('/auth/login')) {
          let serverMessage = data?.message || 'Terjadi kesalahan pada server.'

          // Format error validasi Zod agar lebih enak dibaca (menghilangkan prefix body. / query.)
          if (data?.error_code === 'VALIDATION_ERROR' && data?.message) {
            serverMessage = serverMessage.replace(/(body\.|query\.|params\.)/g, '')
            data.message = serverMessage // Sinkronkan ke response agar komponen menerima pesan yang sudah bersih
          }

          toast(serverMessage, 'error')
        }
      }
    } else {
      // Network Error atau server mati
      toast('Tidak dapat terhubung ke server (Network Error).', 'error')
    }

    return Promise.reject(error)
  }
)

export default instance
