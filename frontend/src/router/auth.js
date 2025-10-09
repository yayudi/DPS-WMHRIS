// router/auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { jwtDecode } from 'jwt-decode' // Impor library decoder
import router from '../router' // Impor router untuk navigasi
import api from '../api/axios' // Impor instance axios terpusat

export const useAuthStore = defineStore('auth', () => {
  // --- STATE ---
  const token = ref(localStorage.getItem('authToken') || null)
  const user = ref(JSON.parse(localStorage.getItem('authUser')) || null)

  // --- GETTERS (Computed Properties) ---
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  // Getter yang lebih kuat untuk memeriksa izin spesifik
  const hasPermission = (permission) => {
    return user.value?.permissions?.includes(permission) || false
  }

  // --- ACTIONS ---

  /**
   * Menangani proses login. Menyimpan token & data user, lalu navigasi.
   */
  async function login(credentials) {
    try {
      const response = await api.post('/auth/login', credentials)
      if (response.data.success && response.data.token) {
        const { token: authToken, user: userData } = response.data

        // Simpan ke state dan localStorage
        token.value = authToken
        user.value = userData
        localStorage.setItem('authToken', authToken)
        localStorage.setItem('authUser', JSON.stringify(userData))

        // Arahkan ke halaman utama setelah login berhasil
        router.push({ name: 'Home' })
      } else {
        throw new Error(response.data.message || 'Login gagal.')
      }
    } catch (error) {
      console.error('Login action error:', error)
      throw error // Lemparkan error agar komponen Login bisa menanganinya
    }
  }

  /**
   * Menangani proses logout. Menghapus data & navigasi.
   */
  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
    router.push({ name: 'Login' })
  }

  /**
   * Memuat ulang data pengguna dari token yang ada di localStorage.
   * Ini penting untuk menjaga state saat halaman di-refresh.
   */
  function fetchUser() {
    const storedToken = localStorage.getItem('authToken')
    if (storedToken) {
      try {
        // Dekode token untuk mendapatkan payload (data user)
        const decoded = jwtDecode(storedToken)

        // Cek apakah token sudah kadaluarsa
        if (decoded.exp * 1000 < Date.now()) {
          console.warn('Token sudah kadaluarsa. Melakukan logout...')
          logout()
        } else {
          // Jika token valid, pulihkan state
          token.value = storedToken
          user.value = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            permissions: decoded.permissions,
          }
          localStorage.setItem('authUser', JSON.stringify(user.value))
        }
      } catch (error) {
        console.error('Gagal mendekode token:', error)
        logout() // Logout jika token tidak valid
      }
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    isAdmin,
    hasPermission,
    login,
    logout,
    fetchUser,
  }
})
