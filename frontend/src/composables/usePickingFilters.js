// frontend/src/composables/usePickingFilters.js
import { reactive, computed, ref, watch } from 'vue'
import debounce from 'lodash/debounce'

export function usePickingFilters(initialState = {}, emitChangeFn = null) {
  const defaultState = {
    search: '',
    source: { include: [], exclude: [] },
    locationPurpose: { include: [], exclude: [] },
    stockStatus: { include: [], exclude: [] },
    shopName: { include: [], exclude: [] },
    sortBy: 'newest',
    viewMode: 'grid',
    startDate: '',
    endDate: ''
  }

  // Helper to ensure nested objects are merged properly
  const mergeState = (def, init) => {
    const merged = { ...def }
    for (const key in init) {
      if (init[key] && typeof init[key] === 'object' && !Array.isArray(init[key])) {
        merged[key] = { ...def[key], ...init[key] }
      } else {
        merged[key] = init[key]
      }
    }
    return merged
  }

  const filterState = reactive(mergeState(defaultState, initialState))
  const isSearching = ref(false)

  // Mapping label for badges
  const labelMap = {
    source: 'Sumber',
    locationPurpose: 'Lokasi',
    stockStatus: 'Status',
    shopName: 'Toko'
  }

  const valueMap = {
    stockStatus: {
      READY: 'Siap Pick',
      ISSUE: 'Bermasalah',
      EMPTY: 'Stok Kosong',
      VALIDATED: 'Selesai',
      VOID: 'Batal',
      RETURNED: 'Retur'
    }
  }

  const hasTriStateFilter = (field) => {
    return filterState[field]?.include?.length > 0 || filterState[field]?.exclude?.length > 0
  }

  const hasActiveFilters = computed(() => {
    return (
      hasTriStateFilter('source') ||
      hasTriStateFilter('locationPurpose') ||
      hasTriStateFilter('stockStatus') ||
      hasTriStateFilter('shopName') ||
      filterState.search !== '' ||
      filterState.startDate !== '' ||
      filterState.endDate !== ''
    )
  })

  const activeFilterBadges = computed(() => {
    const badges = []

    if (filterState.search) {
      badges.push({
        key: 'search',
        label: `Cari: "${filterState.search}"`
      })
    }

    // Iterate specific keys to show as badges
    const triStateKeys = ['source', 'locationPurpose', 'stockStatus', 'shopName']
    triStateKeys.forEach(key => {
      if (hasTriStateFilter(key)) {
        let parts = []
        const mapper = val => valueMap[key]?.[val] || val
        if (filterState[key].include.length > 0) parts.push(`+${filterState[key].include.map(mapper).join(', ')}`)
        if (filterState[key].exclude.length > 0) parts.push(`-${filterState[key].exclude.map(mapper).join(', ')}`)
        
        badges.push({
          key: key,
          label: `${labelMap[key] || key}: ${parts.join(' | ')}`
        })
      }
    })

    if (filterState.startDate || filterState.endDate) {
      badges.push({
        key: 'date',
        label: `Tgl: ${filterState.startDate || '?'} - ${filterState.endDate || '?'}`
      })
    }

    return badges
  })

  function removeFilter(key) {
    if (key === 'search') {
      filterState.search = ''
    } else if (key === 'date') {
      filterState.startDate = ''
      filterState.endDate = ''
    } else {
      filterState[key] = { include: [], exclude: [] }
    }
    if (emitChangeFn) emitChangeFn({ ...filterState })
  }

  function clearFilters() {
    // Deep reset to avoid reactivity issues with arrays
    Object.keys(defaultState).forEach(key => {
      if (typeof defaultState[key] === 'object' && !Array.isArray(defaultState[key])) {
        filterState[key] = { ...defaultState[key] }
      } else {
        filterState[key] = defaultState[key]
      }
    })
    if (emitChangeFn) emitChangeFn({ ...filterState })
  }

  const emitDebouncedSearch = debounce(() => {
    if (emitChangeFn) emitChangeFn({ ...filterState })
    isSearching.value = false
  }, 300)

  function onSearchInput(event) {
    filterState.search = event.target.value
    isSearching.value = true
    emitDebouncedSearch()
  }

  function onSelectChange(field, option) {
    filterState[field] = typeof option === 'object' && option !== null && option.include ? option : typeof option === 'object' ? option.id : option

    // Logic khusus: jika source offline dimatikan, clear lokasi offline
    if (field === 'source') {
      const isOfflineIncluded = filterState.source.include.includes('Offline')
      if (!isOfflineIncluded && hasTriStateFilter('locationPurpose')) {
        filterState.locationPurpose = { include: [], exclude: [] }
      }
    }

    if (emitChangeFn) emitChangeFn({ ...filterState })
  }

  // Watch specifically for date changes since they are mutated directly via v-model
  watch(
    () => [filterState.startDate, filterState.endDate],
    () => {
      if (emitChangeFn) emitChangeFn({ ...filterState })
    }
  )

  return {
    filterState,
    hasActiveFilters,
    activeFilterBadges,
    isSearching,
    clearFilters,
    removeFilter,
    onSearchInput,
    onSelectChange
  }
}
