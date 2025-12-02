import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

// Buat instance axios
const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * 1. REQUEST INTERCEPTOR
 * Menyisipkan token otomatis ke setiap request keluar.
 */
instance.interceptors.request.use(
  (config) => {
    // Lebih baik ambil dari store agar reaktif, tapi fallback ke localStorage aman
    const authStore = useAuthStore()
    const token = authStore.token || localStorage.getItem('token')

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

/**
 * 2. RESPONSE INTERCEPTOR (Refactored)
 * Menangkap error global, khususnya saat token kadaluwarsa (401/403).
 */
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const authStore = useAuthStore()

    // Cek jika error dari server adalah 401 (Unauthorized) atau 403 (Forbidden)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Pastikan kita hanya logout jika user sebelumnya memang login (punya token)
      // agar tidak looping infinite redirect
      if (authStore.token || localStorage.getItem('token')) {
        console.warn('[Axios] Token kadaluwarsa atau tidak valid. Melakukan logout...')

        // Bersihkan state auth & localStorage
        authStore.logout()

        // Redirect paksa ke halaman login dengan pesan
        // Menggunakan window.location.href lebih aman untuk memastikan state aplikasi bersih total
        window.location.href = '/login?expired=true'

        // Jangan lanjutkan error ke komponen (opsional, supaya tidak muncul toast error merah)
        return Promise.reject({ ...error, isHandled: true })
      }
    }

    return Promise.reject(error)
  },
)

export default instance
