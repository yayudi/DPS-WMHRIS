// frontend\src\stores\auth.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api/axios.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token'))
  const user = ref(JSON.parse(localStorage.getItem('authUser')))
  const isLoadingUser = ref(false)

  function setToken(newToken) {
    localStorage.setItem('token', newToken)
    token.value = newToken
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
    localStorage.removeItem('token')
    localStorage.removeItem('authUser')
    token.value = null
    user.value = null
  }

  function logout() {
    clearToken()
    // Jika perlu redirect atau logika lain, bisa ditambahkan di sini.
    // Karena ini dipanggil dari Axios saat token expired, cukup clearToken saja.
  }

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role_id === 1)
  const isSales = computed(() => user.value?.role_id === 2)
  const isGudang = computed(() => user.value?.role_id === 3)
  const username = computed(() => user.value?.username)

  const canViewPrices = computed(() => hasPermission('view-prices'))

  const hasPermission = (permissionName) => {
    if (isAdmin.value) return true
    if (!user.value || !Array.isArray(user.value.permissions)) return false
    return user.value.permissions.includes(permissionName)
  }

  async function fetchUser() {
    if (token.value) {
      isLoadingUser.value = true
      try {
        const response = await api.get('/user/profile')
        setUser(response.data.user)
      } catch (error) {
        clearToken()
      } finally {
        isLoadingUser.value = false
      }
    }
  }

  function updateUserNickname(newNickname) {
    if (user.value) {
      const updatedUser = { ...user.value, nickname: newNickname }
      setUser(updatedUser)
    }
  }

  return {
    token,
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
    hasPermission,
  }
})
