// frontend/src/composables/useFulfilmentFilters.js
import { reactive, computed, ref, watch } from 'vue'
import debounce from 'lodash/debounce'

export function useFulfilmentFilters(initialState = {}, emitChangeFn = null) {
  const defaultState = {
    search: '',
    source: { include: [], exclude: [] },
    locationPurpose: { include: [], exclude: [] },
    stockStatus: { include: [], exclude: [] },
    shopName: { include: [], exclude: [] },
    courier: { include: [], exclude: [] },
    salesPerson: { include: [], exclude: [] },
    productName: '',
    role: 'All', // 'All', 'Picker', 'Packer', 'Shipper'
    sourceType: 'All', // 'All', 'Offline', 'Online'
    isSameday: 'All', // 'All', 'Sameday', 'Reguler'
    isBackorder: 'false', // 'true', 'false'
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
    shopName: 'Toko',
    courier: 'Ekspedisi',
    salesPerson: 'Sales'
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

    // Iterate specific keys to show as badges
    const triStateKeys = ['source', 'locationPurpose', 'stockStatus', 'shopName', 'courier', 'salesPerson']
    triStateKeys.forEach(key => {
      if (hasTriStateFilter(key)) {
        let parts = []
        if (filterState[key].include.length > 0) parts.push(`+${filterState[key].include.join(', ')}`)
        if (filterState[key].exclude.length > 0) parts.push(`-${filterState[key].exclude.join(', ')}`)
        
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

    if (filterState.productName) {
      badges.push({
        key: 'productName',
        label: `Produk: ${filterState.productName}`
      })
    }
    
    if (filterState.role !== 'All') {
      badges.push({
        key: 'role',
        label: `Peran: ${filterState.role}`
      })
    }

    if (filterState.sourceType !== 'All') {
      badges.push({
        key: 'sourceType',
        label: `Tipe: ${filterState.sourceType}`
      })
    }

    if (filterState.isSameday !== 'All') {
      badges.push({
        key: 'isSameday',
        label: `Layanan: ${filterState.isSameday}`
      })
    }

    if (filterState.isBackorder === 'true') {
      badges.push({
        key: 'isBackorder',
        label: `Stok: Backorder`
      })
    }

    return badges
  })

  function removeFilter(key) {
    if (key === 'date') {
      filterState.startDate = ''
      filterState.endDate = ''
    } else if (key === 'productName') {
      filterState.productName = ''
    } else if (key === 'role') {
      filterState.role = 'All'
    } else if (key === 'sourceType') {
      filterState.sourceType = 'All'
    } else if (key === 'isSameday') {
      filterState.isSameday = 'All'
    } else if (key === 'isBackorder') {
      filterState.isBackorder = 'false'
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

  function applyPreset(presetName) {
    clearFilters()
    if (presetName === 'issue') {
      filterState.stockStatus = { include: ['ISSUE'], exclude: [] }
    } else if (presetName === 'empty') {
      filterState.stockStatus = { include: ['EMPTY'], exclude: [] }
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
    onSelectChange,
    applyPreset
  }
}
