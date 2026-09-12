// frontend/src/composables/useWMS.js
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import debounce from 'lodash/debounce'
import { useAuthStore } from '@/stores/auth'
import { fetchProducts as fetchProductsFromApi } from '@/api/helpers/wms.js'
import { useMasterDataStore } from '@/stores/masterData'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import { useColumnVisibility } from '@/composables/useColumnVisibility.js'
import { transformProduct } from '@/composables/useWmsTransform.js'
import { usePagination } from '@/composables/usePagination.js'

const AVAILABLE_COLUMNS = [
  { id: 'sku', label: 'SKU' },
  { id: 'category', label: 'Kategori' },
  { id: 'weight', label: 'Berat' },
  { id: 'dimension', label: 'Dimensi' },
  { id: 'price', label: 'Harga' },
  { id: 'location', label: 'Lokasi' },
  { id: 'stock', label: 'Stok' }
]

export function useWms() {
  const auth = useAuthStore()
  const allLocations = ref([])
  const activeView = ref('all')
  const displayedProducts = ref([])
  const totalProducts = ref(0)

  const {
    currentPage,
    currentLimit: pageSize,
    meta: paginationMeta,
    changePage: goToPage,
    changePageSize
  } = usePagination({
    totalItems: totalProducts,
    storageKey: 'wmsPageSize',
    initialLimit: 30,
    onPageChange: () => fetchProducts('init')
  })

  const loading = ref(true)
  const isLoadingMore = ref(false)
  const isBackgroundLoading = ref(false)
  const error = ref(null)
  const loader = ref(null)
  const searchTerm = ref('')
  const searchBy = ref('name')
  const stockStatusFilter = ref('all')
  const productTypeFilter = ref('all')
  const selectedBuilding = ref({ include: [], exclude: [] })
  const selectedFloor = ref({ include: [], exclude: [] })
  const selectedCategory = ref({ include: [], exclude: [] })
  const sortBy = ref('name')
  const sortOrder = ref('asc')
  const viewMode = ref('infinite') // 'infinite' or 'pagination'
  const isAutoRefetching = ref(true)
  const startDate = ref('')
  const endDate = ref('')

  // Firebase Real-time Event Listener for Stock Updates
  useFirebaseSync(['WMS_DASHBOARD'], 'REFRESH_STOCK', () => {
    if (isAutoRefetching.value && currentPage.value === 1) {
      fetchProducts('silent')
    }
  })

  // Column Visibility State via Generic Composable
  const { visibleColumns, toggleColumn } = useColumnVisibility('wms-visible-columns', [
    'sku',
    'weight',
    'dimension',
    'price',
    'location',
    'stock'
  ])

  const masterData = useMasterDataStore()

  // Ambil data lokasi sekali saja saat composable digunakan
  onMounted(async () => {
    try {
      allLocations.value = await masterData.getLocations()
    } catch (error) {
      console.error('Failed to fetch locations in useWMS', error)
    }
  })

  let observer = null

  function toggleAutoRefetch() {
    isAutoRefetching.value = !isAutoRefetching.value
  }

  async function fetchInitialData() {
    await Promise.all([
      fetchProducts('init'),
      masterData.getLocations().then(data => {
        allLocations.value = data
      })
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
      // OPTIMIZATION: If user selects ALL categories, don't send the filter to avoid URL Too Long errors.
      let finalCategoryInclude = []
      let finalCategoryExclude = []
      if (selectedCategory.value.include.length !== masterData.categories.length) {
        finalCategoryInclude = selectedCategory.value.include.map(String)
      }
      if (selectedCategory.value.exclude.length !== masterData.categories.length) {
        finalCategoryExclude = selectedCategory.value.exclude.map(String)
      }

      const params = {
        page: currentPage.value,
        limit: pageSize.value,
        search: searchTerm.value,
        searchBy: searchBy.value,
        location: activeView.value,
        stockStatus: stockStatusFilter.value,
        is_package: productTypeFilter.value === 'all' ? undefined : productTypeFilter.value === 'package',

        buildingInclude: JSON.stringify(selectedBuilding.value.include),
        buildingExclude: JSON.stringify(selectedBuilding.value.exclude),
        floorInclude: JSON.stringify(selectedFloor.value.include),
        floorExclude: JSON.stringify(selectedFloor.value.exclude),
        categoryInclude: JSON.stringify(finalCategoryInclude),
        categoryExclude: JSON.stringify(finalCategoryExclude),

        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        startDate: startDate.value,
        endDate: endDate.value
      }

      if (!params.startDate || !params.endDate) {
        delete params.startDate
        delete params.endDate
      }

      if (mode === 'silent') {
        params._t = Date.now()
      }

      const response = await fetchProductsFromApi(params)
      const newProducts = response.products || []
      const total = response.total || 0

      let transformed = newProducts.map(p => transformProduct(p, selectedBuilding.value, selectedFloor.value))

      if (!auth.canViewPrices) {
        transformed.forEach(product => delete product.price)
      }

      // --- LOGIKA UPDATE STATE ---
      if (mode === 'init') {
        displayedProducts.value = transformed
      } else if (mode === 'loadMore') {
        displayedProducts.value.push(...transformed)
      } else if (mode === 'silent') {
        const incomingMap = new Map(transformed.map(p => [p.id, p]))
        let patchCount = 0
        let realChangesCount = 0

        displayedProducts.value.forEach(existingProduct => {
          const updatedData = incomingMap.get(existingProduct.id)
          if (updatedData) {
            const isTotalChanged = existingProduct.totalStock !== updatedData.totalStock
            const isGudangChanged = existingProduct.stockGudang !== updatedData.stockGudang
            const isPajanganChanged = existingProduct.stockPajangan !== updatedData.stockPajangan
            const isLTCChanged = existingProduct.stockLTC !== updatedData.stockLTC
            const isLocationCodeChanged = existingProduct.allLocationsCode !== updatedData.allLocationsCode

            if (isTotalChanged || isGudangChanged || isPajanganChanged || isLTCChanged || isLocationCodeChanged) {
              console.log(
                `%c[CHANGE] ${existingProduct.name} (SKU: ${existingProduct.sku})`,
                'color: orange; font-weight: bold'
              )
              if (isTotalChanged)
                console.log(`   Total Stock: ${existingProduct.totalStock} -> ${updatedData.totalStock}`)
              if (isGudangChanged)
                console.log(`   Gudang: ${existingProduct.stockGudang} -> ${updatedData.stockGudang}`)
              if (isPajanganChanged)
                console.log(`   Pajangan: ${existingProduct.stockPajangan} -> ${updatedData.stockPajangan}`)
              if (isLocationCodeChanged)
                console.log(`   Loc Codes: ${existingProduct.allLocationsCode} -> ${updatedData.allLocationsCode}`)

              realChangesCount++
            }

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

  const handleSearchInput = debounce(value => {
    searchTerm.value = value
  }, 300)

  function handleSort(column) {
    if (sortBy.value === column) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = column
      sortOrder.value = 'asc'
    }
  }

  const hasMoreData = computed(() => displayedProducts.value.length < totalProducts.value)
  const totalPages = computed(() => paginationMeta.value.totalPages)

  // goToPage and changePageSize are handled by usePagination

  onMounted(() => {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry && entry.isIntersecting && !loading.value) {
          loadMoreProducts()
        }
      },
      { threshold: 0.5 }
    )
  })

  onUnmounted(() => {
    if (observer) observer.disconnect()
  })

  watch(
    () => auth.isAuthenticated,
    isAuth => {
      if (isAuth) {
        if (displayedProducts.value.length === 0) fetchInitialData()
      }
    },
    { immediate: true }
  )

  watch(loader, newLoader => {
    if (observer && newLoader) observer.observe(newLoader)
  })

  watch(
    [
      searchTerm,
      searchBy,
      activeView,
      stockStatusFilter,
      productTypeFilter,
      selectedBuilding,
      selectedFloor,
      selectedCategory,
      sortBy,
      sortOrder,
      startDate,
      endDate,
      viewMode
    ],
    () => {
      resetAndRefetch()
    }
  )

  const searchPlaceholder = computed(() => `Cari produk berdasarkan ${searchBy.value === 'name' ? 'Nama' : 'SKU'}...`)

  return {
    activeView,
    displayedProducts,
    loading,
    error,
    loader,
    searchBy,
    stockStatusFilter,
    productTypeFilter,
    searchTerm,
    currentPage,
    totalProducts,
    totalPages,
    pageSize,
    isLoadingMore,
    isBackgroundLoading,
    hasMoreData,
    searchPlaceholder,
    selectedBuilding,
    selectedFloor,
    selectedCategory,
    sortBy,
    sortOrder,
    allLocations,
    isAutoRefetching,
    startDate,
    endDate,
    viewMode,
    goToPage,
    changePageSize,
    handleSearchInput,
    handleSort,
    toggleAutoRefetch,
    visibleColumns,
    availableColumns: AVAILABLE_COLUMNS,
    toggleColumn,
    resetAndRefetch,
    fetchProducts
  }
}
