import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePagination } from '@/composables/usePagination'

describe('usePagination composable', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('initializes with default values', () => {
    const totalItems = ref(0)
    const { currentPage, currentLimit, meta } = usePagination({ totalItems })

    expect(currentPage.value).toBe(1)
    expect(currentLimit.value).toBe(10)
    expect(meta.value.page).toBe(1)
    expect(meta.value.limit).toBe(10)
    expect(meta.value.total).toBe(0)
    expect(meta.value.totalPages).toBe(1)
  })

  it('respects initialPage and initialLimit', () => {
    const totalItems = ref(100)
    const { currentPage, currentLimit } = usePagination({
      totalItems,
      initialPage: 3,
      initialLimit: 25
    })

    expect(currentPage.value).toBe(3)
    expect(currentLimit.value).toBe(25)
  })

  it('restores limit from localStorage if storageKey is provided', () => {
    localStorage.setItem('myTestKey', '50')
    const totalItems = ref(0)
    const { currentLimit } = usePagination({
      totalItems,
      storageKey: 'myTestKey',
      initialLimit: 10
    })

    expect(currentLimit.value).toBe(50)
  })

  it('changePage updates currentPage and triggers onPageChange callback', () => {
    const totalItems = ref(50)
    const onPageChangeSpy = vi.fn()
    const { currentPage, changePage } = usePagination({
      totalItems,
      onPageChange: onPageChangeSpy
    })

    changePage(2)
    expect(currentPage.value).toBe(2)
    expect(onPageChangeSpy).toHaveBeenCalledOnce()
  })

  it('changePageSize updates currentLimit, resets to page 1, triggers callback, and saves to localStorage', () => {
    const totalItems = ref(50)
    const onPageChangeSpy = vi.fn()
    const { currentPage, currentLimit, changePageSize } = usePagination({
      totalItems,
      initialPage: 2,
      storageKey: 'testLimitKey',
      onPageChange: onPageChangeSpy
    })

    changePageSize(20)
    expect(currentLimit.value).toBe(20)
    expect(currentPage.value).toBe(1)
    expect(localStorage.getItem('testLimitKey')).toBe('20')
    expect(onPageChangeSpy).toHaveBeenCalledOnce()
  })

  it('paginates an array correctly (client-side)', () => {
    const items = ref([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const { paginatedData, meta, changePage } = usePagination({
      totalItems: items,
      initialLimit: 5
    })

    // Page 1
    expect(paginatedData.value).toEqual([1, 2, 3, 4, 5])
    expect(meta.value.totalPages).toBe(3)
    expect(meta.value.total).toBe(12)

    // Page 2
    changePage(2)
    expect(paginatedData.value).toEqual([6, 7, 8, 9, 10])

    // Page 3
    changePage(3)
    expect(paginatedData.value).toEqual([11, 12])
  })

  it('automatically resets to page 1 if totalItems drops and currentPage goes out of bounds', async () => {
    const totalItems = ref(25) // totalPages = 3 (limit 10)
    const { currentPage } = usePagination({ totalItems, initialLimit: 10 })
    
    currentPage.value = 3 // Last page

    // Decrease total items to 15 (totalPages = 2)
    totalItems.value = 15
    
    // Wait for watchers to trigger
    await nextTick()

    // Should reset to 1
    expect(currentPage.value).toBe(1)
  })
})
