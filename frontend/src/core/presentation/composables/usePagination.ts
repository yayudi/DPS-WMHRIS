import { ref, computed, watch } from 'vue'

/**
 * Universal composable for pagination logic (Client-side & Server-side).
 * 
 * @param {Object} options
 * @param {import('vue').Ref<Array|number>} options.totalItems - Ref containing either an array of items (client-side) or a total count number (server-side).
 * @param {number} [options.initialPage=1] - Default starting page.
 * @param {number} [options.initialLimit=10] - Default items per page.
 * @param {string} [options.storageKey=null] - LocalStorage key to persist the page limit.
 * @param {Function} [options.onPageChange=null] - Callback triggered when page or limit changes (useful for server-side fetching).
 */
export function usePagination({
  totalItems = null,
  initialPage = 1,
  initialLimit = 10,
  storageKey = null,
  onPageChange = null
} = {}) {
  const currentPage = ref(initialPage)
  const currentLimit = ref(storageKey ? parseInt(localStorage.getItem(storageKey)) || initialLimit : initialLimit)

  const changePage = (page) => {
    currentPage.value = page
    if (onPageChange) onPageChange()
  }

  const changePageSize = (limit) => {
    currentLimit.value = limit
    currentPage.value = 1
    if (storageKey) localStorage.setItem(storageKey, limit)
    if (onPageChange) onPageChange()
  }

  // Client-side slicing
  const paginatedData = computed(() => {
    if (!totalItems || !Array.isArray(totalItems.value)) return []
    const start = (currentPage.value - 1) * currentLimit.value
    const end = start + currentLimit.value
    return totalItems.value.slice(start, end)
  })

  const totalPages = computed(() => {
    if (!totalItems) return 1
    const total = Array.isArray(totalItems.value) ? totalItems.value.length : (totalItems.value || 0)
    return Math.ceil(total / currentLimit.value) || 1
  })

  // Watch for out of bounds
  watch(totalPages, (newMax) => {
    if (currentPage.value > newMax) {
      currentPage.value = 1
    }
  })

  // Format matches BasePagination `<BasePagination :pagination="meta" />`
  const meta = computed(() => ({
    page: currentPage.value,
    limit: currentLimit.value,
    total: Array.isArray(totalItems?.value) ? totalItems.value.length : (totalItems?.value || 0),
    totalPages: totalPages.value
  }))

  return {
    currentPage,
    currentLimit,
    changePage,
    changePageSize,
    paginatedData,
    meta
  }
}
