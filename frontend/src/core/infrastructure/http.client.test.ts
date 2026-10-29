import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import axios, { http } from '@/core/infrastructure/http.client'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/modules/auth/application/auth.store'

const mockToast = vi.fn()
vi.mock('@/core/presentation/composables/useToast', () => ({
  useToast: () => ({ toast: mockToast })
}))

// Mock window.location and matchMedia
const originalWindowLocation = window.location
beforeAll(() => {
  delete (window as any).location
  window.location = { href: '' } as any

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})
afterAll(() => {
  window.location = originalWindowLocation
  delete (window as any).matchMedia
})

describe('Axios Interceptors & HTTP Helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    window.location.href = ''
    mockToast.mockClear()
    vi.clearAllMocks()
  })

  it('Should increase timeout for FormData and Blob requests', async () => {
    const formDataConfig = { data: new FormData(), headers: {} } as any
    const fulfilledHandler = (axios.interceptors.request as any).handlers[0].fulfilled
    const resForm = await fulfilledHandler(formDataConfig)
    expect(resForm.timeout).toBe(80000)

    const blobConfig = { responseType: 'blob', headers: {} } as any
    const resBlob = await fulfilledHandler(blobConfig)
    expect(resBlob.timeout).toBe(80000)
  })

  it('Should handle 401 Unauthorized by logging out and redirecting after delay', async () => {
    vi.useFakeTimers()
    const authStore = useAuthStore()
    const logoutSpy = vi.spyOn(authStore, 'logout').mockImplementation(() => {})

    const error = {
      response: { status: 401, data: {} },
      config: { url: '/api/some-endpoint' }
    } as any

    const rejectedHandler = (axios.interceptors.response as any).handlers[0].rejected
    await expect(rejectedHandler(error)).rejects.toBe(error)

    expect(logoutSpy).toHaveBeenCalled()
    expect(mockToast).toHaveBeenCalledWith('Sesi Anda telah habis, silakan login kembali.', 'error')

    vi.advanceTimersByTime(2000)
    expect(window.location.href).toBe('/login')
    vi.useRealTimers()
  })

  it('Should format Zod validation errors on 400', async () => {
    const error = {
      response: {
        status: 400,
        data: {
          error_code: 'VALIDATION_ERROR',
          message: 'body.email is required'
        }
      },
      config: { url: '/api/data' }
    } as any

    const rejectedHandler = (axios.interceptors.response as any).handlers[0].rejected
    try {
      await rejectedHandler(error)
    } catch (e: any) {
      expect(e.response.data.message).toBe('email is required')
      expect(mockToast).toHaveBeenCalledWith('email is required', 'error')
    }
  })

  it('Should reject when success is false in response body', async () => {
    const response = {
      config: { url: '/test' },
      data: {
        success: false,
        message: 'Stok tidak mencukupi untuk transfer'
      }
    } as any

    const fulfilledHandler = (axios.interceptors.response as any).handlers[0].fulfilled
    await expect(fulfilledHandler(response)).rejects.toThrow('Stok tidak mencukupi untuk transfer')
    expect(mockToast).toHaveBeenCalledWith('Stok tidak mencukupi untuk transfer', 'error')
  })

  it('Should bypass success check when responseType is blob', async () => {
    const fakeBlob = new Blob(['sample-data'])
    const response = {
      config: { url: '/export', responseType: 'blob' },
      data: fakeBlob
    } as any

    const fulfilledHandler = (axios.interceptors.response as any).handlers[0].fulfilled
    const result = await fulfilledHandler(response)
    expect(result.data).toBe(fakeBlob)
  })

  it('Should suppress toast when silentErrorToast is true', async () => {
    const error = {
      response: {
        status: 500,
        data: { message: 'Internal Server Error' }
      },
      config: { url: '/api/data', silentErrorToast: true }
    } as any

    const rejectedHandler = (axios.interceptors.response as any).handlers[0].rejected
    await expect(rejectedHandler(error)).rejects.toBe(error)
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('http.blob should send responseType blob and unwrap data', async () => {
    const fakeBlob = new Blob(['excel-content'])
    const getSpy = vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: fakeBlob } as any)

    const result = await http.blob('/wms/stock/export', { params: { search: 'item' } })
    expect(getSpy).toHaveBeenCalledWith('/wms/stock/export', {
      params: { search: 'item' },
      responseType: 'blob'
    })
    expect(result).toBe(fakeBlob)
  })

  it('http.upload should send multipart/form-data header and unwrap data', async () => {
    const formData = new FormData()
    const mockApiResponse = { success: true, message: 'Uploaded', data: { fileId: 10 } }
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce({ data: mockApiResponse } as any)

    const result = await http.upload('/upload', formData)
    expect(postSpy).toHaveBeenCalledWith(
      '/upload',
      formData,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'multipart/form-data'
        })
      })
    )
    expect(result).toEqual(mockApiResponse)
  })
})
