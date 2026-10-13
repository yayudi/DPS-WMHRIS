// frontend\src\stores\auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/axios.js'
import { triggerPwaUpdate, isPwaUpdateAvailable } from '@/composables/usePwaUpdate.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(JSON.parse(localStorage.getItem('authUser')))
  const token = ref(localStorage.getItem('token'))
  const isLoadingUser = ref(false)

  function setToken(newToken) {
    token.value = newToken || null
    if (newToken) {
      localStorage.setItem('token', newToken)
    } else {
      localStorage.removeItem('token')
    }
    if (isPwaUpdateAvailable && triggerPwaUpdate) {
      triggerPwaUpdate(true)
    }
  }

  function setUser(newUser) {
    user.value = newUser
    if (newUser) {
      localStorage.setItem('authUser', JSON.stringify(newUser))
    } else {
      localStorage.removeItem('authUser')
    }
  }

  function clearToken() {
    localStorage.removeItem('authUser')
    localStorage.removeItem('token')
    user.value = null
    token.value = null
  }

  function logout() {
    clearToken()
    if (isPwaUpdateAvailable && triggerPwaUpdate) {
      triggerPwaUpdate(true)
    }
  }

  const isAuthenticated = computed(() => !!user.value || !!token.value)
  const isAdmin = computed(() => user.value?.role_id === 1)
  const isSales = computed(() => user.value?.role_id === 2)
  const isGudang = computed(() => user.value?.role_id === 3)
  const username = computed(() => user.value?.username)

  const canViewPrices = computed(() => hasPermission('view-prices'))

  const hasPermission = permissionName => {
    if (isAdmin.value) return true
    if (!user.value || !Array.isArray(user.value.permissions)) return false
    return user.value.permissions.includes(permissionName)
  }

  async function fetchUser() {
    isLoadingUser.value = true
    try {
      const response = await api.get('/user/profile')
      setUser(response.data.user)
    } catch (error) {
      console.error(error)
      clearToken(error)
    } finally {
      isLoadingUser.value = false
    }
  }

  function updateUserNickname(newNickname) {
    if (user.value) {
      const updatedUser = { ...user.value, nickname: newNickname }
      setUser(updatedUser)
    }
  }

  return {
    user,
    token,
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
