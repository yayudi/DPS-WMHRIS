import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authApi } from './auth.api'
import { http } from '@/core/infrastructure/http.client'
import type { LoginRawResponse } from '../domain/auth.types'

vi.mock('@/core/infrastructure/http.client', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}))

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('login sends payload and returns raw login response directly without double unwrapping', async () => {
    const mockResponse: LoginRawResponse = {
      success: true,
      message: 'Login berhasil',
      token: 'jwt-token-123',
      user: {
        id: 2147483652,
        username: 'firman',
        role_id: 1,
        permissions: []
      }
    }

    vi.mocked(http.post).mockResolvedValueOnce(mockResponse as any)

    const payload = { username: 'firman', password: 'secretpassword' }
    const res = await authApi.login(payload)

    expect(http.post).toHaveBeenCalledWith('/auth/login', payload)
    expect(res).toBeDefined()
    expect(res.success).toBe(true)
    expect(res.token).toBe('jwt-token-123')
    expect(res.user?.username).toBe('firman')
  })

  it('getProfile delegates to http.get /user/profile', async () => {
    const mockProfile = {
      success: true,
      message: 'OK',
      data: { id: 1, username: 'admin', role_id: 1, permissions: [] }
    }
    vi.mocked(http.get).mockResolvedValueOnce(mockProfile)

    const res = await authApi.getProfile()
    expect(http.get).toHaveBeenCalledWith('/user/profile')
    expect(res).toEqual(mockProfile)
  })

  it('testConnection delegates to http.get /test', async () => {
    const mockPing = { success: true, message: 'Pong', data: null }
    vi.mocked(http.get).mockResolvedValueOnce(mockPing)

    const res = await authApi.testConnection()
    expect(http.get).toHaveBeenCalledWith('/test')
    expect(res).toEqual(mockPing)
  })
})

