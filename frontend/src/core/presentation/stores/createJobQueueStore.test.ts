import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createJobQueueStore } from './createJobQueueStore'

describe('createJobQueueStore factory', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes store with empty jobs, pendingCount 0, and isExpanded false', () => {
    const mockApi = vi.fn().mockResolvedValue([])
    const useTestStore = createJobQueueStore('test_init', mockApi)
    const store = useTestStore()

    expect(store.jobs).toEqual([])
    expect(store.pendingCount).toBe(0)
    expect(store.isExpanded).toBe(false)
  })

  it('fetches jobs and accurately computes pendingCount for PENDING and PROCESSING status', async () => {
    const mockJobs = [
      { id: 1, status: 'PENDING' },
      { id: 2, status: 'PROCESSING' },
      { id: 3, status: 'COMPLETED' },
      { id: 4, status: 'FAILED' }
    ]
    const mockApi = vi.fn().mockResolvedValue(mockJobs)
    const useTestStore = createJobQueueStore('test_fetch', mockApi)
    const store = useTestStore()

    await store.fetchJobs()

    expect(store.jobs).toEqual(mockJobs)
    expect(store.pendingCount).toBe(2)
  })

  it('supports API responses structured with a data property', async () => {
    const mockData = {
      data: [
        { id: 10, status: 'PROCESSING' },
        { id: 20, status: 'COMPLETED' }
      ]
    }
    const mockApi = vi.fn().mockResolvedValue(mockData)
    const useTestStore = createJobQueueStore('test_data_wrapper', mockApi)
    const store = useTestStore()

    await store.fetchJobs()

    expect(store.jobs.length).toBe(2)
    expect(store.pendingCount).toBe(1)
  })

  it('expands widget and triggers fetch on notifyNewJob', async () => {
    const mockApi = vi.fn().mockResolvedValue([{ id: 1, status: 'PENDING' }])
    const useTestStore = createJobQueueStore('test_notify', mockApi)
    const store = useTestStore()

    expect(store.isExpanded).toBe(false)
    store.notifyNewJob()

    expect(store.isExpanded).toBe(true)
    expect(mockApi).toHaveBeenCalledTimes(1)
  })

  it('toggles isExpanded state via toggleWidget', () => {
    const mockApi = vi.fn().mockResolvedValue([])
    const useTestStore = createJobQueueStore('test_toggle', mockApi)
    const store = useTestStore()

    expect(store.isExpanded).toBe(false)
    store.toggleWidget()
    expect(store.isExpanded).toBe(true)
    store.toggleWidget()
    expect(store.isExpanded).toBe(false)
  })

  it('handles API rejection gracefully without unhandled crashes', async () => {
    const consoleSpy = vi.spyToHide ? vi.spyToHide() : vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockApi = vi.fn().mockRejectedValue(new Error('Network error'))
    const useTestStore = createJobQueueStore('test_error', mockApi)
    const store = useTestStore()

    await expect(store.fetchJobs()).resolves.not.toThrow()
    expect(store.jobs).toEqual([])
    expect(store.pendingCount).toBe(0)
    consoleSpy.mockRestore()
  })
})

