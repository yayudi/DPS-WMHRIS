import type { OfflineScanItem } from '../domain/offline_scan.entity'

const DB_NAME = 'DPS_WMS_OFFLINE_DB'
const DB_VERSION = 1
const STORE_NAME = 'pending_scans'

let dbInstance: IDBDatabase | null = null

/**
 * Initializes and returns the IndexedDB instance for WMS offline buffer.
 */
export function initOfflineDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance)
  }

  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'))
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('status', 'status', { unique: false })
      }
    }

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result
      resolve(dbInstance)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}

/**
 * Enqueues a picking scan into the local IndexedDB buffer.
 */
export async function enqueueOfflineScan(
  item: Omit<OfflineScanItem, 'id' | 'timestamp' | 'status'>
): Promise<number> {
  const db = await initOfflineDB()
  const payload: OfflineScanItem = {
    ...item,
    timestamp: Date.now(),
    status: 'PENDING'
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.add(payload)

    request.onsuccess = () => {
      resolve(request.result as number)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Retrieves all pending scans awaiting synchronization.
 */
export async function getPendingScans(): Promise<OfflineScanItem[]> {
  const db = await initOfflineDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      resolve((request.result || []) as OfflineScanItem[])
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Removes successfully synchronized scans by their primary key IDs.
 */
export async function removeOfflineScans(ids: number[]): Promise<void> {
  if (ids.length === 0) return

  const db = await initOfflineDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    for (const id of ids) {
      store.delete(id)
    }

    tx.oncomplete = () => {
      resolve()
    }

    tx.onerror = () => {
      reject(tx.error)
    }
  })
}

/**
 * Returns the total count of pending scans in the buffer.
 */
export async function getPendingScanCount(): Promise<number> {
  const db = await initOfflineDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.count()

    request.onsuccess = () => {
      resolve(request.result || 0)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

/**
 * Clears the entire offline buffer (for tests or reset).
 */
export async function clearOfflineBuffer(): Promise<void> {
  const db = await initOfflineDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.clear()

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}
