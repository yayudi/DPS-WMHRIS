import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchProducts as fetchProductsFromApi } from '@/api/helpers/wms.js'
import { fetchAllLocations } from '@/api/helpers/stock.js'
import { EventSourcePolyfill } from 'event-source-polyfill'

export function useWms() {
  const auth = useAuthStore()
  const allLocations = ref([])
  const activeView = ref('gudang')
  const displayedProducts = ref([])
  const currentPage = ref(1)
  const totalProducts = ref(0)
  const loading = ref(true)
  const isLoadingMore = ref(false)
  const error = ref(null)
  const pageSize = 30
  const loader = ref(null)
  const searchTerm = ref('')
  const searchBy = ref('name')
  const showMinusStockOnly = ref(false)
  const selectedBuilding = ref('all')
  const selectedFloor = ref('all')
  const sortBy = ref('name')
  const sortOrder = ref('asc')
  const isAutoRefetching = ref(true)
  // --- STATE BARU: Untuk filter tanggal dari modal ---
  const startDate = ref('')
  const endDate = ref('')

  const sseStatus = ref('disconnected')
  const recentlyUpdatedProducts = ref(new Set())
  let eventSource = null
  let reconnectTimer = null
  let refetchIntervalId = null
  let observer = null
  let debounceTimer = null

  function toggleAutoRefetch() {
    isAutoRefetching.value = !isAutoRefetching.value
  }

  function transformProduct(apiProduct) {
    const locations = apiProduct.stock_locations || []
    const pajanganLocations = locations.filter((loc) => loc.location_code.startsWith('A12'))
    const stockPajangan = pajanganLocations.reduce((sum, loc) => sum + loc.quantity, 0)
    const lokasiPajangan = pajanganLocations.map((loc) => loc.location_code).join(', ')
    const gudangLocations = locations.filter(
      (loc) =>
        loc.location_code.startsWith('A19') ||
        loc.location_code.startsWith('A20') ||
        loc.location_code.startsWith('B16') ||
        loc.location_code.startsWith('OASIS'),
    )
    const stockGudang = gudangLocations.reduce((sum, loc) => sum + loc.quantity, 0)
    const lokasiGudang = gudangLocations.map((loc) => loc.location_code).join(', ')
    const ltcLocation = locations.find((loc) => loc.location_code === 'LTC')
    const stockLTC = ltcLocation ? ltcLocation.quantity : 0
    const lokasiLTC = ltcLocation ? ltcLocation.location_code : 'N/A'

    return {
      id: apiProduct.id,
      sku: apiProduct.sku,
      name: apiProduct.name,
      price: apiProduct.price,
      stockPajangan,
      lokasiPajangan,
      pajanganLocations,
      stockGudang,
      lokasiGudang,
      gudangLocations,
      stockLTC,
      lokasiLTC,
    }
  }

  async function fetchInitialData() {
    loading.value = true
    error.value = null
    try {
      await Promise.all([
        fetchProducts(true),
        fetchAllLocations().then((data) => {
          allLocations.value = data
        }),
      ])
    } catch (err) {
      console.error('Error fetching initial WMS data:', err)
      error.value = 'Gagal memuat data awal WMS.'
    } finally {
      loading.value = false
    }
  }

  async function fetchProducts(isNewSearch = false) {
    if (isNewSearch) loading.value = true
    else isLoadingMore.value = true
    error.value = null

    try {
      const params = {
        page: currentPage.value,
        limit: pageSize,
        search: searchTerm.value,
        searchBy: searchBy.value,
        location: activeView.value,
        minusStockOnly: showMinusStockOnly.value,
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

      const response = await fetchProductsFromApi(params)
      const newProducts = response.products || []
      const total = response.total || 0
      const transformed = newProducts.map(transformProduct)

      if (!auth.canViewPrices) {
        transformed.forEach((product) => delete product.price)
      }

      if (isNewSearch) {
        displayedProducts.value = transformed
      } else {
        displayedProducts.value.push(...transformed)
      }
      totalProducts.value = total
    } catch (err) {
      console.error('Error fetching WMS products from API:', err)
      if (isNewSearch) error.value = 'Gagal memuat data produk.'
    } finally {
      if (isNewSearch) loading.value = false
      isLoadingMore.value = false
    }
  }

  function setupRealtimeUpdates() {
    if (eventSource) eventSource.close()
    clearTimeout(reconnectTimer)

    const token = auth.token
    if (!token) return

    sseStatus.value = 'connecting'
    console.log('[SSE] Mencoba terhubung...')

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
    eventSource = new EventSource(`${apiBaseUrl}/realtime/stock-updates?token=${token}`)

    eventSource.onopen = () => {
      sseStatus.value = 'connected'
      console.log('[SSE] Berhasil terhubung.')
    }

    eventSource.onmessage = (event) => {
      const updatedProducts = JSON.parse(event.data)
      updatedProducts.forEach((update) => {
        const productInView = displayedProducts.value.find((p) => p.id === update.productId)
        if (productInView) {
          const updatedProductData = { ...productInView, stock_locations: update.newStock }
          const newTransformedProduct = transformProduct(updatedProductData)
          Object.assign(productInView, newTransformedProduct)
          recentlyUpdatedProducts.value.add(update.productId)
          setTimeout(() => {
            recentlyUpdatedProducts.value.delete(update.productId)
          }, 2000)
        }
      })
    }

    eventSource.onerror = (err) => {
      console.error('[SSE] Error koneksi, akan mencoba lagi dalam 5 detik...', err)
      sseStatus.value = 'disconnected'
      eventSource.close()
      reconnectTimer = setTimeout(setupRealtimeUpdates, 5000)
    }
  }

  function loadMoreProducts() {
    if (hasMoreData.value && !isLoadingMore.value) {
      currentPage.value++
      fetchProducts(false)
    }
  }

  function resetAndRefetch() {
    currentPage.value = 1
    displayedProducts.value = []
    totalProducts.value = 0
    nextTick(() => {
      fetchProducts(true)
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
    if (eventSource) eventSource.close()
    clearTimeout(reconnectTimer)
    clearInterval(refetchIntervalId)
    if (observer) observer.disconnect()
  })

  watch(
    isAutoRefetching,
    (newValue) => {
      if (newValue && !refetchIntervalId) {
        refetchIntervalId = setInterval(() => {
          fetchProducts(true)
        }, 60000)
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
        setupRealtimeUpdates()
      }
    },
    { immediate: true },
  )

  watch(loader, (newLoader) => {
    if (observer && newLoader) {
      observer.observe(newLoader)
    }
  })

  watch(
    [
      searchTerm,
      searchBy,
      activeView,
      showMinusStockOnly,
      selectedBuilding,
      selectedFloor,
      sortBy,
      sortOrder,
      startDate,
      endDate,
    ],
    () => {
      if ((startDate.value && endDate.value) || (!startDate.value && !endDate.value)) {
        currentPage.value = 1
        fetchProducts(true)
      }
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
    hasMoreData,
    searchPlaceholder,
    selectedBuilding,
    selectedFloor,
    sortBy,
    sortOrder,
    allLocations,
    isAutoRefetching,
    sseStatus,
    recentlyUpdatedProducts,
    startDate,
    endDate,
    handleSearchInput,
    handleSort,
    toggleAutoRefetch,
    resetAndRefetch,
  }
}
