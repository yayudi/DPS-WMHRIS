import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import api from '@/api/axios'

// Mock axios
vi.mock('@/api/axios', () => {
  return {
    default: {
      get: vi.fn()
    }
  }
})

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('Should set token and update localStorage', () => {
    const store = useAuthStore()
    store.setToken('test-token')
    
    expect(store.token).toBe('test-token')
    expect(localStorage.getItem('token')).toBe('test-token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('Should set user and update localStorage', () => {
    const store = useAuthStore()
    const mockUser = { id: 1, username: 'tester', role_id: 1 }
    store.setUser(mockUser)

    expect(store.user).toEqual(mockUser)
    expect(JSON.parse(localStorage.getItem('authUser'))).toEqual(mockUser)
    expect(store.isAdmin).toBe(true)
  })

  it('Should clear token and user on logout', () => {
    const store = useAuthStore()
    store.setToken('test-token')
    store.setUser({ id: 1, username: 'tester' })
    
    store.logout()

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('authUser')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('Should check permissions correctly', () => {
    const store = useAuthStore()
    
    // Admin has all permissions
    store.setUser({ id: 1, role_id: 1, permissions: [] })
    expect(store.hasPermission('any-permission')).toBe(true)

    // Non-admin with specific permission
    store.setUser({ id: 2, role_id: 2, permissions: ['product_price.view'] })
    expect(store.hasPermission('product_price.view')).toBe(true)
    expect(store.hasPermission('delete-users')).toBe(false)
    expect(store.canViewPrices).toBe(true)
  })

  it('fetchUser updates user profile on success', async () => {
    const store = useAuthStore()
    store.setToken('test-token')
    
    const mockProfile = { id: 1, username: 'fetched-user' }
    api.get.mockResolvedValueOnce({ data: { user: mockProfile } })

    await store.fetchUser()

    expect(api.get).toHaveBeenCalledWith('/user/profile')
    expect(store.user).toEqual(mockProfile)
    expect(store.isLoadingUser).toBe(false)
  })

  it('fetchUser clears token on failure', async () => {
    const store = useAuthStore()
    store.setToken('invalid-token')
    
    api.get.mockRejectedValueOnce(new Error('Network error'))

    await store.fetchUser()

    expect(store.token).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    expect(store.isLoadingUser).toBe(false)
  })
})
