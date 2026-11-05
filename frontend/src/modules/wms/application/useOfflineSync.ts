import { ref, onMounted, getCurrentInstance } from 'vue'
import type { ExecutePickingPayload } from '../infrastructure/wms.api'
import { wmsApi } from '../infrastructure/wms.api'
import {
  enqueueOfflineScan,
  getPendingScans,
  removeOfflineScans,
  getPendingScanCount
} from '../infrastructure/offline_buffer'

const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const isSyncing = ref(false)
const pendingCount = ref(0)
const syncError = ref<string | null>(null)
const lastSyncTime = ref<Date | null>(null)

let isListenerRegistered = false

/**
 * Composable for managing WMS Dead Zone picking offline buffer and auto-sync.
 */
export function useOfflineSync() {
  const refreshPendingCount = async () => {
    try {
      pendingCount.value = await getPendingScanCount()
    } catch {
      // Non-blocking in non-indexedDB environments
    }
  }

  const syncPendingScans = async (): Promise<{ synced: number; failed: number }> => {
    if (isSyncing.value || !isOnline.value) {
      return { synced: 0, failed: 0 }
    }

    try {
      isSyncing.value = true
      syncError.value = null

      const pendingItems = await getPendingScans()
      if (pendingItems.length === 0) {
        pendingCount.value = 0
        return { synced: 0, failed: 0 }
      }

      const payloads: ExecutePickingPayload[] = pendingItems.map((item) => ({
        transaction_id: item.transaction_id,
        movement_id: item.movement_id,
        location_id: item.location_id,
        qty_done: item.qty_done
      }))

      const result = await wmsApi.batchExecuteTransactions(payloads)

      const successCount = result.success_count ?? (result as any).successCount ?? 0
      const failureCount = result.failure_count ?? (result as any).failureCount ?? 0

      // Remove successfully processed scans
      const processedIds = pendingItems
        .slice(0, successCount)
        .map((i) => i.id)
        .filter((id): id is number => typeof id === 'number')

      if (processedIds.length > 0) {
        await removeOfflineScans(processedIds)
      }

      await refreshPendingCount()
      lastSyncTime.value = new Date()

      if (failureCount > 0 && result.errors && result.errors.length > 0) {
        syncError.value = result.errors.join('; ')
      }

      return {
        synced: successCount,
        failed: failureCount
      }
    } catch (err: any) {
      syncError.value = err?.message || 'Gagal sinkronisasi data offline'
      return { synced: 0, failed: pendingCount.value }
    } finally {
      isSyncing.value = false
    }
  }

  const recordPickingScan = async (
    payload: ExecutePickingPayload
  ): Promise<{ success: boolean; offline: boolean; error?: string }> => {
    // 1. If currently offline, buffer immediately
    if (!isOnline.value) {
      await enqueueOfflineScan(payload)
      await refreshPendingCount()
      return { success: true, offline: true }
    }

    // 2. Try direct online call
    try {
      await wmsApi.executeTransaction(payload)
      return { success: true, offline: false }
    } catch (err: any) {
      // If network unreachable, fallback to offline buffer
      const isNetworkError =
        !navigator.onLine ||
        err?.code === 'ERR_NETWORK' ||
        err?.message?.includes('Network Error') ||
        !err?.response

      if (isNetworkError) {
        isOnline.value = false
        await enqueueOfflineScan(payload)
        await refreshPendingCount()
        return { success: true, offline: true }
      }

      return { success: false, offline: false, error: err?.message || 'Eksekusi picking gagal' }
    }
  }

  const handleOnline = () => {
    isOnline.value = true
    syncPendingScans()
  }

  const handleOffline = () => {
    isOnline.value = false
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      refreshPendingCount()

      if (!isListenerRegistered && typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        isListenerRegistered = true
      }
    })
  } else {
    refreshPendingCount()
  }

  return {
    isOnline,
    isSyncing,
    pendingCount,
    syncError,
    lastSyncTime,
    refreshPendingCount,
    syncPendingScans,
    recordPickingScan
  }
}
