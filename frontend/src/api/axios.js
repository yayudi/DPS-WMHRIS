// frontend\src\api\axios.js
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
 * REQUEST INTERCEPTOR
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
 * RESPONSE INTERCEPTOR (Refactored)
 * Menangkap error global, khususnya saat token kadaluwarsa (401/403).
 */
instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const authStore = useAuthStore() // Pastikan import store sudah benar di sini

    if (error.response) {
      const { status } = error.response

      // Token Expired / Tidak Valid (401)
      // -> HANYA Logout jika statusnya 401
      if (status === 401) {
        authStore.logout()
        // Opsional: Redirect ke login page
        window.location.href = '/login'
      }

      // Tidak Punya Izin (403)
      // -> JANGAN Logout, tapi beri tahu user
      else if (status === 403) {
        const serverMessage = error.response.data?.message || 'Akses ditolak.'

        alert(`Gagal: ${serverMessage}`)
      }
    }

    return Promise.reject(error)
  },
)

export default instance
