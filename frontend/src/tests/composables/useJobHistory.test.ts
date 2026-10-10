import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useJobHistory } from '@/composables/useJobHistory'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import * as useToastModule from '@/composables/useToast'
import * as swalConfirmModule from '@/composables/useSweetAlert'

// Mock dependencies
vi.mock('@/modules/wms/infrastructure/stock.api', () => ({
  stockApi: {
    voidImportJob: vi.fn()
  }
}))

vi.mock('@/stores/uploadStore.js', () => ({
  useUploadStore: vi.fn()
}))

vi.mock('@/composables/useToast.js', () => ({
  useToast: vi.fn()
}))

vi.mock('@/composables/useSweetAlert.js', () => ({
  swalConfirm: vi.fn()
}))
describe('useJobHistory composable', () => {
  const mockToast = vi.fn()
  const mockFetchJobs = vi.fn()

  beforeEach(async () => {
    setActivePinia(createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        auth: { user: { id: 1 } }
      }
    }))
    
    vi.clearAllMocks()
    vi.useFakeTimers()
    useToastModule.useToast.mockReturnValue({ toast: mockToast })
    
    // Mock uploadStore
    const { useUploadStore } = await import('@/stores/uploadStore')
    useUploadStore.mockReturnValue({
      jobs: [],
      isExpanded: false,
      fetchJobs: mockFetchJobs
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('fetches and filters job history by prefix', async () => {
    const { useUploadStore } = await import('@/stores/uploadStore')
    useUploadStore.mockReturnValue({
      jobs: [
        { id: 1, job_type: 'IMPORT_SALES_SHOPEE', created_at: '2026-07-01' },
        { id: 2, job_type: 'IMPORT_ATTENDANCE', created_at: '2026-07-02' },
        { id: 3, job_type: 'IMPORT_SALES_TOKOPEDIA', created_at: '2026-07-03' }
      ],
      fetchJobs: mockFetchJobs
    })

    const { importJobHistory, fetchJobHistory } = useJobHistory('IMPORT_SALES_')
    
    await fetchJobHistory()

    expect(mockFetchJobs).toHaveBeenCalled()
    // Should only contain IMPORT_SALES_ and be sorted by created_at desc
    expect(importJobHistory.value.length).toBe(2)
    expect(importJobHistory.value[0].id).toBe(3) // Newest first
    expect(importJobHistory.value[1].id).toBe(1)
  })

  it('handles void job when confirmed', async () => {
    swalConfirmModule.swalConfirm.mockResolvedValue(true)
    stockApi.voidImportJob.mockResolvedValue({})

    const { handleVoidJob } = useJobHistory('TEST')
    
    await handleVoidJob({ id: 10, original_filename: 'test.csv' })

    expect(swalConfirmModule.swalConfirm).toHaveBeenCalledWith('Void antrian file "test.csv"?')
    expect(stockApi.voidImportJob).toHaveBeenCalledWith(10)
    expect(mockToast).toHaveBeenCalledWith('Antrian berhasil di-void.', 'success')
    expect(mockFetchJobs).toHaveBeenCalled() // fetchJobHistory called after void
  })

  it('calculates progress correctly', () => {
    const { getProgress } = useJobHistory('TEST')
    
    expect(getProgress({})).toBe(0)
    expect(getProgress({ total_records: 0 })).toBe(0)
    expect(getProgress({ processed_records: 50, total_records: 100 })).toBe(50)
    expect(getProgress({ processed_records: 150, total_records: 100 })).toBe(100) // capped at 100
  })
})
