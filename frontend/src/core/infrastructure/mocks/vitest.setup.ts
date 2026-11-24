import { beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Membuat implementasi Storage in-memory untuk lingkungan test
 * ketika globalThis.localStorage tidak tersedia (mis. Node v25+ tanpa --localstorage-file).
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length(): number {
      return store.size
    },
    clear(): void {
      store.clear()
    },
    getItem(key: string): string | null {
      return store.get(String(key)) ?? null
    },
    key(index: number): string | null {
      if (index < 0 || index >= store.size) return null
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string): void {
      store.delete(String(key))
    },
    setItem(key: string, value: string): void {
      store.set(String(key), String(value))
    }
  }
}

function resolveWorkingStorage(target: object): Storage | null {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'localStorage')
  if (!descriptor) return null

  try {
    const candidate = (target as { localStorage?: unknown }).localStorage as Partial<Storage> | undefined
    if (
      candidate &&
      typeof candidate.getItem === 'function' &&
      typeof candidate.setItem === 'function' &&
      typeof candidate.clear === 'function'
    ) {
      return candidate as Storage
    }
  } catch {
    return null
  }

  return null
}

const existingGlobalStorage = resolveWorkingStorage(globalThis)
const existingWindowStorage =
  typeof window !== 'undefined' && window !== globalThis ? resolveWorkingStorage(window) : null

const activeStorage = existingGlobalStorage ?? existingWindowStorage ?? createMemoryStorage()

if (!existingGlobalStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: activeStorage,
    writable: true,
    configurable: true
  })
}

if (typeof window !== 'undefined' && !existingWindowStorage) {
  Object.defineProperty(window, 'localStorage', {
    value: activeStorage,
    writable: true,
    configurable: true
  })
}

setActivePinia(createPinia())

beforeEach(() => {
  setActivePinia(createPinia())
  globalThis.localStorage.clear()
})
