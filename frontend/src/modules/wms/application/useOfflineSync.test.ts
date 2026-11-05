import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOfflineSync } from './useOfflineSync'
import { wmsApi } from '../infrastructure/wms.api'
import * as buffer from '../infrastructure/offline_buffer'

vi.mock('../infrastructure/wms.api', () => ({
  wmsApi: {
    executeTransaction: vi.fn(),
    batchExecuteTransactions: vi.fn()
  }
}))

vi.mock('../infrastructure/offline_buffer', () => ({
  enqueueOfflineScan: vi.fn(),
  getPendingScans: vi.fn(),
  removeOfflineScans: vi.fn(),
  getPendingScanCount: vi.fn(),
  clearOfflineBuffer: vi.fn()
}))

describe('useOfflineSync Composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records scan directly when online and API succeeds', async () => {
    const { isOnline, recordPickingScan } = useOfflineSync()
    isOnline.value = true

    vi.mocked(wmsApi.executeTransaction).mockResolvedValueOnce()

    const res = await recordPickingScan({
      transaction_id: 1,
      movement_id: 10,
      location_id: 100,
      qty_done: 5
    })

    expect(res.success).toBe(true)
    expect(res.offline).toBe(false)
    expect(wmsApi.executeTransaction).toHaveBeenCalledWith({
      transaction_id: 1,
      movement_id: 10,
      location_id: 100,
      qty_done: 5
    })
    expect(buffer.enqueueOfflineScan).not.toHaveBeenCalled()
  })

  it('buffers scan locally when network fails during online scan', async () => {
    const { isOnline, recordPickingScan } = useOfflineSync()
    isOnline.value = true

    vi.mocked(wmsApi.executeTransaction).mockRejectedValueOnce({
      code: 'ERR_NETWORK',
      message: 'Network Error'
    })
    vi.mocked(buffer.enqueueOfflineScan).mockResolvedValueOnce(1)
    vi.mocked(buffer.getPendingScanCount).mockResolvedValueOnce(1)

    const res = await recordPickingScan({
      transaction_id: 2,
      movement_id: 20,
      location_id: 101,
      qty_done: 3
    })

    expect(res.success).toBe(true)
    expect(res.offline).toBe(true)
    expect(isOnline.value).toBe(false)
    expect(buffer.enqueueOfflineScan).toHaveBeenCalledWith({
      transaction_id: 2,
      movement_id: 20,
      location_id: 101,
      qty_done: 3
    })
  })

  it('buffers scan immediately when device is offline', async () => {
    const { isOnline, recordPickingScan } = useOfflineSync()
    isOnline.value = false

    vi.mocked(buffer.enqueueOfflineScan).mockResolvedValueOnce(2)
    vi.mocked(buffer.getPendingScanCount).mockResolvedValueOnce(2)

    const res = await recordPickingScan({
      transaction_id: 3,
      movement_id: 30,
      location_id: 102,
      qty_done: 2
    })

    expect(res.success).toBe(true)
    expect(res.offline).toBe(true)
    expect(wmsApi.executeTransaction).not.toHaveBeenCalled()
    expect(buffer.enqueueOfflineScan).toHaveBeenCalled()
  })

  it('syncs pending scans in batch and removes completed items', async () => {
    const { isOnline, syncPendingScans } = useOfflineSync()
    isOnline.value = true

    vi.mocked(buffer.getPendingScans).mockResolvedValueOnce([
      { id: 101, transaction_id: 1, movement_id: 10, location_id: 50, qty_done: 2, timestamp: 123 },
      { id: 102, transaction_id: 2, movement_id: 20, location_id: 51, qty_done: 4, timestamp: 124 }
    ])

    vi.mocked(wmsApi.batchExecuteTransactions).mockResolvedValueOnce({
      total_processed: 2,
      success_count: 2,
      failure_count: 0
    })
    vi.mocked(buffer.removeOfflineScans).mockResolvedValueOnce()
    vi.mocked(buffer.getPendingScanCount).mockResolvedValueOnce(0)

    const res = await syncPendingScans()

    expect(res.synced).toBe(2)
    expect(res.failed).toBe(0)
    expect(wmsApi.batchExecuteTransactions).toHaveBeenCalledWith([
      { transaction_id: 1, movement_id: 10, location_id: 50, qty_done: 2 },
      { transaction_id: 2, movement_id: 20, location_id: 51, qty_done: 4 }
    ])
    expect(buffer.removeOfflineScans).toHaveBeenCalledWith([101, 102])
  })
})
