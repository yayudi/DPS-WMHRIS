import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '../infrastructure/auth.api'
import type { AuthUser } from '../domain/user.entity'
import { triggerPwaUpdate, isPwaUpdateAvailable } from '@/composables/usePwaUpdate'

export const useAuthStore = defineStore('auth', () => {
  // Coba muat user dari local storage saat inisialisasi
  const storedUser = localStorage.getItem('authUser')
  const user = ref<AuthUser | null>(storedUser ? JSON.parse(storedUser) : null)
  const isLoadingUser = ref(false)

  function setToken() {
    if (isPwaUpdateAvailable && triggerPwaUpdate) {
      triggerPwaUpdate(true)
    }
  }

  function setUser(newUser: AuthUser | null) {
    user.value = newUser
    if (newUser) {
      localStorage.setItem('authUser', JSON.stringify(newUser))
    } else {
      localStorage.removeItem('authUser')
    }
  }

  function clearToken() {
    localStorage.removeItem('authUser')
    user.value = null
  }

  function logout() {
    clearToken()
    if (isPwaUpdateAvailable && triggerPwaUpdate) {
      triggerPwaUpdate(true)
    }
  }

  const isAuthenticated = computed(() => !!user.value)
  
  // Catatan: Walaupun role_id di backend dinamis, UI legacy mungkin masih mengandalkan ID hardcoded.
  // Pengecekan idealnya menggunakan hasPermission.
  const isAdmin = computed(() => user.value?.role_id === 1)
  const isSales = computed(() => user.value?.role_id === 2)
  const isGudang = computed(() => user.value?.role_id === 3)
  
  const username = computed(() => user.value?.username)

  const canViewPrices = computed(() => hasPermission('product_price.view'))

  const hasPermission = (permissionName: string) => {
    if (isAdmin.value) return true
    if (!user.value || !Array.isArray(user.value.permissions)) return false
    return user.value.permissions.includes(permissionName)
  }

  async function fetchUser() {
    isLoadingUser.value = true
    try {
      const response = await authApi.getProfile()
      // API mereturn ApiResponse<AuthUser> dimana objek user ada di dalam properti 'data'
      if (response.success && response.data) {
        setUser(response.data)
      } else {
        clearToken()
      }
    } catch (error) {
      console.error(error)
      clearToken() 
    } finally {
      isLoadingUser.value = false
    }
  }

  function updateUserNickname(newNickname: string) {
    if (user.value) {
      const updatedUser = { ...user.value, nickname: newNickname }
      setUser(updatedUser)
    }
  }

  return {
    user,
    isLoadingUser,
    setToken,
    setUser,
    clearToken,
    logout,
    isAuthenticated,
    username,
    isAdmin,
    isSales,
    isGudang,
    fetchUser,
    canViewPrices,
    updateUserNickname,
    hasPermission
  }
})
