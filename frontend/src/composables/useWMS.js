// frontend/src/composables/useWMS.js
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchProducts as fetchProductsFromApi } from '@/api/helpers/wms.js'
import { fetchAllLocations } from '@/api/helpers/stock.js'

export function useWms() {
  const auth = useAuthStore()
  const allLocations = ref([])
  const activeView = ref('all')
  const displayedProducts = ref([])
  const currentPage = ref(1)
  const totalProducts = ref(0)
  const loading = ref(true)
  const isLoadingMore = ref(false)
  const isBackgroundLoading = ref(false)
  const error = ref(null)
  const pageSize = 30
  const loader = ref(null)
  const searchTerm = ref('')
  const searchBy = ref('name')
  const showMinusStockOnly = ref(false)
  const showPackageOnly = ref(false)
  const selectedBuilding = ref('all')
  const selectedFloor = ref('all')
  const sortBy = ref('name')
  const sortOrder = ref('asc')
  const isAutoRefetching = ref(true)
  const startDate = ref('')
  const endDate = ref('')

  let refetchIntervalId = null
  let observer = null
  let debounceTimer = null

  function toggleAutoRefetch() {
    isAutoRefetching.value = !isAutoRefetching.value
  }

  function matchesFilters(loc) {
    let buildingMatch = true
    if (selectedBuilding.value !== 'all') {
      if (loc.building) {
        buildingMatch = loc.building === selectedBuilding.value
      } else if (loc.location_code) {
        buildingMatch = loc.location_code.startsWith(selectedBuilding.value)
      }
    }

    let floorMatch = true
    if (selectedFloor.value !== 'all') {
      if (loc.floor !== undefined && loc.floor !== null) {
        floorMatch = String(loc.floor) === String(selectedFloor.value)
      }
    }

    return buildingMatch && floorMatch
  }

  function transformProduct(apiProduct) {
    const locations = apiProduct.stock_locations || []

    const filteredLocations = locations.filter(matchesFilters)

    const pajanganLocations = filteredLocations.filter((loc) => loc.purpose === 'DISPLAY')
    const stockPajangan = pajanganLocations.reduce((sum, loc) => sum + loc.quantity, 0)
    const lokasiPajangan = pajanganLocations.map((loc) => loc.location_code).join(', ')

    const gudangLocations = filteredLocations.filter((loc) => loc.purpose === 'WAREHOUSE')
    const stockGudang = gudangLocations.reduce((sum, loc) => sum + loc.quantity, 0)
    const lokasiGudang = gudangLocations.map((loc) => loc.location_code).join(', ')

    const ltcLocation = filteredLocations.find((loc) => loc.purpose === 'BRANCH')
    const stockLTC = ltcLocation ? ltcLocation.quantity : 0
    const lokasiLTC = ltcLocation ? ltcLocation.location_code : 'N/A'

    const filteredTotalStock = filteredLocations.reduce((sum, loc) => sum + loc.quantity, 0)
    const filteredAllLocationsCode = filteredLocations.map((loc) => loc.location_code).join(', ')

    return {
      id: apiProduct.id,
      sku: apiProduct.sku,
      name: apiProduct.name,
      price: apiProduct.price,
      weight: apiProduct.weight,
      is_package: Boolean(apiProduct.is_package),

      stockPajangan,
      lokasiPajangan,
      pajanganLocations,
      stockGudang,
      lokasiGudang,
      gudangLocations,
      stockLTC,
      lokasiLTC,
      totalStock: filteredTotalStock,
      allLocationsCode: filteredAllLocationsCode,
      stock_locations: filteredLocations,
    }
  }

  async function fetchInitialData() {
    await Promise.all([
      fetchProducts('init'),
      fetchAllLocations().then((data) => {
        allLocations.value = data
      }),
    ])
  }

  /**
   * Fetch Products dengan 3 Mode:
   * 'init'     -> Loading Penuh (Spinner Besar). Reset data.
   * 'loadMore' -> Loading Bawah. Append data.
   * 'silent'   -> Tidak ada Loading Spinner. Update data in-place (Patch).
   */
  async function fetchProducts(mode = 'init') {
    if (mode === 'init') loading.value = true
    else if (mode === 'loadMore') isLoadingMore.value = true
    else if (mode === 'silent') isBackgroundLoading.value = true

    error.value = null

    try {
      const params = {
        page: currentPage.value,
        limit: pageSize,
        search: searchTerm.value,
        searchBy: searchBy.value,
        location: activeView.value,
        minusOnly: showMinusStockOnly.value,
        packageOnly: showPackageOnly.value,
        building: selectedBuilding.value,
        floor: selectedFloor.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        startDate: startDate.value,
        endDate: endDate.value,
      }

      if (!params.startDate || !params.endDate) {
        delete params.startDate
        delete params.endDate
      }

      // [UPDATE] Anti-Cache Mechanism: Tambahkan timestamp unik ke request silent
      if (mode === 'silent') {
        params._t = Date.now()
      }

      const response = await fetchProductsFromApi(params)
      const newProducts = response.products || []
      const total = response.total || 0

      let transformed = newProducts.map(transformProduct)

      const isMasterView =
        activeView.value === 'all' &&
        selectedBuilding.value === 'all' &&
        selectedFloor.value === 'all'

      if (!isMasterView) {
        transformed = transformed.filter((p) => {
          let stockToCheck = 0
          if (activeView.value === 'all') stockToCheck = p.totalStock
          else if (activeView.value === 'gudang') stockToCheck = p.stockGudang
          else if (activeView.value === 'pajangan') stockToCheck = p.stockPajangan
          else if (activeView.value === 'ltc') stockToCheck = p.stockLTC
          return stockToCheck !== 0
        })
      }

      if (!auth.canViewPrices) {
        transformed.forEach((product) => delete product.price)
      }

      // --- LOGIKA UPDATE STATE ---
      if (mode === 'init') {
        displayedProducts.value = transformed
      } else if (mode === 'loadMore') {
        displayedProducts.value.push(...transformed)
      } else if (mode === 'silent') {
        // [DEBUG-TRACE] Logika Audit Perubahan Data
        console.groupCollapsed(`[WMS] Silent Update Check @ ${new Date().toLocaleTimeString()}`)
        console.log(`Incoming Items: ${transformed.length}`)

        const incomingMap = new Map(transformed.map((p) => [p.id, p]))
        let patchCount = 0
        let realChangesCount = 0

        displayedProducts.value.forEach((existingProduct) => {
          const updatedData = incomingMap.get(existingProduct.id)
          if (updatedData) {
            // [FIXED LOGIC] Cek perubahan secara mendalam (Breakdown per lokasi)
            const isTotalChanged = existingProduct.totalStock !== updatedData.totalStock
            const isGudangChanged = existingProduct.stockGudang !== updatedData.stockGudang
            const isPajanganChanged = existingProduct.stockPajangan !== updatedData.stockPajangan
            const isLTCChanged = existingProduct.stockLTC !== updatedData.stockLTC
            // Cek lokasi juga agar jika lokasi berpindah tapi jumlah sama tetap terdeteksi
            const isLocationCodeChanged =
              existingProduct.allLocationsCode !== updatedData.allLocationsCode

            if (
              isTotalChanged ||
              isGudangChanged ||
              isPajanganChanged ||
              isLTCChanged ||
              isLocationCodeChanged
            ) {
              console.log(
                `%c[CHANGE] ${existingProduct.name} (SKU: ${existingProduct.sku})`,
                'color: orange; font-weight: bold',
              )
              if (isTotalChanged)
                console.log(
                  `   Total Stock: ${existingProduct.totalStock} -> ${updatedData.totalStock}`,
                )
              if (isGudangChanged)
                console.log(
                  `   Gudang: ${existingProduct.stockGudang} -> ${updatedData.stockGudang}`,
                )
              if (isPajanganChanged)
                console.log(
                  `   Pajangan: ${existingProduct.stockPajangan} -> ${updatedData.stockPajangan}`,
                )
              if (isLocationCodeChanged)
                console.log(
                  `   Loc Codes: ${existingProduct.allLocationsCode} -> ${updatedData.allLocationsCode}`,
                )

              realChangesCount++
            }

            // Patching Data (Selalu update agar reaktif terhadap perubahan kecil sekalipun)
            existingProduct.stock_locations = updatedData.stock_locations
            existingProduct.totalStock = updatedData.totalStock

            existingProduct.stockGudang = updatedData.stockGudang
            existingProduct.stockPajangan = updatedData.stockPajangan
            existingProduct.stockLTC = updatedData.stockLTC

            existingProduct.lokasiGudang = updatedData.lokasiGudang
            existingProduct.lokasiPajangan = updatedData.lokasiPajangan
            existingProduct.lokasiLTC = updatedData.lokasiLTC

            existingProduct.allLocationsCode = updatedData.allLocationsCode

            existingProduct.name = updatedData.name
            existingProduct.sku = updatedData.sku
            existingProduct.price = updatedData.price
            existingProduct.weight = updatedData.weight
            patchCount++
          }
        })

        console.log(`Matched Items: ${patchCount}`)

        if (realChangesCount > 0) {
          console.log(
            `%c[RESULT] Data Updated! ${realChangesCount} items changed.`,
            'color: green; font-weight: bold',
          )
        } else {
          console.log(`%c[RESULT] No data changes detected. UI will not update.`, 'color: gray')
        }
        console.groupEnd()
      }

      totalProducts.value = total
    } catch (err) {
      console.error('Error fetching WMS products from API:', err)
      if (mode === 'init') error.value = 'Gagal memuat data produk.'
    } finally {
      if (mode === 'init') loading.value = false
      isLoadingMore.value = false
      isBackgroundLoading.value = false
    }
  }

  function loadMoreProducts() {
    if (hasMoreData.value && !isLoadingMore.value) {
      currentPage.value++
      fetchProducts('loadMore')
    }
  }

  function resetAndRefetch() {
    currentPage.value = 1
    displayedProducts.value = []
    totalProducts.value = 0
    nextTick(() => {
      fetchProducts('init')
    })
  }

  function handleSearchInput(value) {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      searchTerm.value = value
    }, 300)
  }

  function handleSort(column) {
    if (sortBy.value === column) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = column
      sortOrder.value = 'asc'
    }
  }

  const hasMoreData = computed(() => displayedProducts.value.length < totalProducts.value)

  onMounted(() => {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && !loading.value) {
          loadMoreProducts()
        }
      },
      { threshold: 0.5 },
    )
  })

  onUnmounted(() => {
    clearInterval(refetchIntervalId)
    if (observer) observer.disconnect()
  })

  watch(
    isAutoRefetching,
    (newValue) => {
      if (newValue && !refetchIntervalId) {
        refetchIntervalId = setInterval(() => {
          if (currentPage.value === 1) {
            fetchProducts('silent')
          }
        }, 30000)
      } else if (!newValue && refetchIntervalId) {
        clearInterval(refetchIntervalId)
        refetchIntervalId = null
      }
    },
    { immediate: true },
  )

  watch(
    () => auth.isAuthenticated,
    (isAuth) => {
      if (isAuth) {
        if (displayedProducts.value.length === 0) fetchInitialData()
      }
    },
    { immediate: true },
  )

  watch(loader, (newLoader) => {
    if (observer && newLoader) observer.observe(newLoader)
  })

  watch(
    [
      searchTerm,
      searchBy,
      activeView,
      showMinusStockOnly,
      showPackageOnly,
      selectedBuilding,
      selectedFloor,
      sortBy,
      sortOrder,
      startDate,
      endDate,
    ],
    () => {
      // Trigger full reset on filter change
      resetAndRefetch()
    },
  )

  const searchPlaceholder = computed(
    () => `Cari produk berdasarkan ${searchBy.value === 'name' ? 'Nama' : 'SKU'}...`,
  )

  return {
    activeView,
    displayedProducts,
    loading,
    error,
    loader,
    searchBy,
    showMinusStockOnly,
    showPackageOnly,
    searchTerm,
    currentPage,
    totalProducts,
    isLoadingMore,
    isBackgroundLoading,
    hasMoreData,
    searchPlaceholder,
    selectedBuilding,
    selectedFloor,
    sortBy,
    sortOrder,
    allLocations,
    isAutoRefetching,
    startDate,
    endDate,
    handleSearchInput,
    handleSort,
    toggleAutoRefetch,
    resetAndRefetch,
    fetchProducts,
  }
}
