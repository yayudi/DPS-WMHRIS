import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { http } from '@/core/infrastructure/http.client'
import type { AuthUser } from '../domain/user.entity'

// Mock http client
vi.mock('@/core/infrastructure/http.client', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    blob: vi.fn(),
    upload: vi.fn()
  },
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('Should set user and update localStorage', () => {
    const store = useAuthStore()
    const mockUser: AuthUser = { id: 1, username: 'tester', role_id: 1, permissions: [] }
    store.setUser(mockUser)

    expect(store.user).toEqual(mockUser)
    expect(JSON.parse(localStorage.getItem('authUser') || '{}')).toEqual(mockUser)
    expect(store.isAuthenticated).toBe(true)
    expect(store.isAdmin).toBe(true)
  })

  it('Should clear user on logout', () => {
    const store = useAuthStore()
    const mockUser: AuthUser = { id: 1, username: 'tester', role_id: 1, permissions: [] }
    store.setUser(mockUser)
    expect(store.isAuthenticated).toBe(true)

    store.logout()

    expect(store.user).toBeNull()
    expect(localStorage.getItem('authUser')).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('Should check permissions correctly', () => {
    const store = useAuthStore()

    // Admin has all permissions
    store.setUser({ id: 1, username: 'admin', role_id: 1, permissions: [] })
    expect(store.hasPermission('any-permission')).toBe(true)

    // Non-admin with specific permission
    store.setUser({ id: 2, username: 'user', role_id: 2, permissions: ['product_price.view'] })
    expect(store.hasPermission('product_price.view')).toBe(true)
    expect(store.hasPermission('delete-users')).toBe(false)
    expect(store.canViewPrices).toBe(true)
  })

  it('fetchUser updates user profile on success', async () => {
    const store = useAuthStore()
    const mockProfile: AuthUser = { id: 1, username: 'fetched-user', role_id: 2, permissions: [] }

    vi.mocked(http.get).mockResolvedValueOnce({
      success: true,
      message: 'OK',
      data: mockProfile
    })

    await store.fetchUser()

    expect(http.get).toHaveBeenCalledWith('/user/profile')
    expect(store.user).toEqual(mockProfile)
    expect(store.isLoadingUser).toBe(false)
  })

  it('fetchUser clears session on failure', async () => {
    const store = useAuthStore()
    store.setUser({ id: 1, username: 'invalid-user', role_id: 2, permissions: [] })

    vi.mocked(http.get).mockRejectedValueOnce(new Error('Network error'))

    await store.fetchUser()

    expect(store.user).toBeNull()
    expect(localStorage.getItem('authUser')).toBeNull()
    expect(store.isLoadingUser).toBe(false)
  })
})
