// frontend\src\composables\useStatsTable.js
import { ref, computed } from 'vue'
import { useSortIcon } from './useSortIcon'

/**
 * Composable to handle common statistics table logic like sorting and lazy loading.
 *
 * @param {import('vue').Ref<Array>} rawData - The source data array
 * @param {Object} options - Configuration options
 * @param {string} options.initialSortKey - Field to sort by initially
 * @param {boolean} options.initialSortDesc - Initial sort direction
 * @param {number} options.pageSize - Number of items to load per "page" (lazy load)
 */
export function useStatsTable(rawData, options = {}) {
  const { initialSortKey = 'id', initialSortDesc = true, pageSize = 50 } = options

  const sortKey = ref(initialSortKey)
  const sortDesc = ref(initialSortDesc)
  const visibleCount = ref(pageSize)

  /**
   * Sorts the data based on current key and direction.
   */
  const displayedData = computed(() => {
    if (!Array.isArray(rawData.value)) return []

    return [...rawData.value].sort((a, b) => {
      let valA = a[sortKey.value]
      let valB = b[sortKey.value]

      // Handle strings
      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()

      // Handle nulls/undefined
      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1

      if (valA < valB) return sortDesc.value ? 1 : -1
      if (valA > valB) return sortDesc.value ? -1 : 1
      return 0
    })
  })

  /**
   * Sliced data for lazy loading.
   */
  const visibleData = computed(() => {
    return displayedData.value.slice(0, visibleCount.value)
  })

  /**
   * Changes the sort key or toggles direction.
   * @param {string} key
   */
  const sortBy = key => {
    if (sortKey.value === key) {
      sortDesc.value = !sortDesc.value
    } else {
      sortKey.value = key
      sortDesc.value = true
    }
    // Reset lazy load to top
    visibleCount.value = pageSize
  }

  /**
   * Returns FontAwesome icon class for sorting state.
   */
  const { getSortIcon } = useSortIcon(sortKey, sortDesc)

  /**
   * Increments visible count.
   */
  const loadMore = () => {
    if (visibleCount.value < displayedData.value.length) {
      visibleCount.value += pageSize
    }
  }

  /**
   * Event handler for table container scroll.
   * @param {Event} e
   */
  const handleTableScroll = e => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      loadMore()
    }
  }

  return {
    sortKey,
    sortDesc,
    visibleCount,
    displayedData,
    visibleData,
    sortBy,
    getSortIcon,
    loadMore,
    handleTableScroll
  }
}
