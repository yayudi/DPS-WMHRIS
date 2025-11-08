import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/axios.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token')) // Ganti 'token' jadi 'token'
  // ✅ PERBAIKAN: Baca 'authUser' dari localStorage saat inisialisasi
  const user = ref(JSON.parse(localStorage.getItem('authUser')))
  const isLoadingUser = ref(false)

  function setToken(newToken) {
    localStorage.setItem('token', newToken)
    token.value = newToken
  }

  // ✅ BARU: Helper untuk sinkronisasi state DAN localStorage
  function setUser(newUser) {
    user.value = newUser
    if (newUser) {
      localStorage.setItem('authUser', JSON.stringify(newUser))
    } else {
      localStorage.removeItem('authUser')
    }
  }

  function clearToken() {
    localStorage.removeItem('token')
    localStorage.removeItem('authUser') // Hapus authUser juga
    token.value = null
    user.value = null
  }

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role_id === 1)
  const isSales = computed(() => user.value?.role_id === 2)
  const isGudang = computed(() => user.value?.role_id === 3)
  const username = computed(() => user.value?.username)

  // ✅ PERBAIKAN: Gunakan izin, bukan role
  const canViewPrices = computed(() => hasPermission('view-prices'))

  // ✅ BARU: Helper Izin (untuk RCAB WMS)
  const hasPermission = (permissionName) => {
    if (isAdmin.value) return true // Admin (role 1) selalu bisa
    if (!user.value || !Array.isArray(user.value.permissions)) return false
    return user.value.permissions.includes(permissionName)
  }

  async function fetchUser() {
    // ✅ PERBAIKAN: Hapus '!user.value' agar data SELALU refresh
    if (token.value) {
      isLoadingUser.value = true
      try {
        const response = await api.get('/user/profile')
        setUser(response.data.user) // Gunakan setUser
      } catch (error) {
        clearToken() // Logout jika token/sesi tidak valid
      } finally {
        isLoadingUser.value = false
      }
    } else {
    }
  }

  function updateUserNickname(newNickname) {
    if (user.value) {
      // ✅ PERBAIKAN: Gunakan setUser agar localStorage ikut ter-update
      const updatedUser = { ...user.value, nickname: newNickname }
      setUser(updatedUser)
    }
  }

  return {
    token,
    user,
    isLoadingUser,
    setToken,
    setUser, // Ekspor setUser
    clearToken,
    isAuthenticated,
    username,
    isAdmin,
    isSales,
    isGudang,
    fetchUser,
    canViewPrices,
    updateUserNickname,
    hasPermission, // Ekspor hasPermission
  }
})
