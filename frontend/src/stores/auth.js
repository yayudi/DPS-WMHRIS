// frontend\src\stores\auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/axios.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('authToken'))
  const user = ref(null) // Untuk menyimpan data user
  const isLoadingUser = ref(false)

  function setToken(newToken) {
    localStorage.setItem('authToken', newToken)
    token.value = newToken
  }

  function clearToken() {
    localStorage.removeItem('authToken')
    token.value = null
    user.value = null
  }

  // Cek apakah user sudah login berdasarkan token
  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role_id === 1)
  const isSales = computed(() => user.value?.role_id === 2)
  const isGudang = computed(() => user.value?.role_id === 3)
  const username = computed(() => user.value?.username)
  const canViewPrices = computed(() => isAdmin.value || isSales.value)

  // Aksi baru untuk mengambil data user dari backend
  async function fetchUser() {
    // Hanya fetch jika ada token dan user belum ada
    if (token.value && !user.value) {
      isLoadingUser.value = true // <-- SET LOADING JADI TRUE
      try {
        const response = await api.get('/user/profile')
        user.value = response.data.user
      } catch (error) {
        console.error('Gagal mengambil data user, token mungkin expired.', error)
        clearToken()
      } finally {
        isLoadingUser.value = false // <-- SET LOADING JADI FALSE
      }
    }
  }

  return {
    token,
    user,
    isLoadingUser,
    setToken,
    clearToken,
    isAuthenticated,
    username,
    isAdmin,
    isSales,
    isGudang,
    fetchUser,
    canViewPrices,
  }
})
