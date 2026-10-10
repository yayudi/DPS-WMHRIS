import { ref, reactive, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { returnApi } from '@/modules/wms/infrastructure/return.api'
import { useToast } from '@/composables/useToast'
import { usePagination } from '@/composables/usePagination'
import { useMasterDataStore } from '@/stores/masterData'

export function useReturnManager() {
  const { toast } = useToast()

  const activeTab = ref<'pending' | 'history'>('pending')
  const items = ref<any[]>([])
  const isLoading = ref(false)
  const searchQuery = ref('')
  const filterState = reactive({
    source: { include: [] as string[], exclude: [] as string[] },
    condition: '',
    locationId: '',
    startDate: '',
    endDate: '',
    sortOrder: 'desc'
  })

  const totalItems = ref(0)
  const {
    currentPage,
    currentLimit,
    meta: pagination,
    changePage: doChangePage,
    changePageSize: doChangeLimit
  } = usePagination({
    totalItems,
    initialLimit: 10,
    storageKey: 'returnManagerLimit'
  })

  const locations = ref<any[]>([])

  // State Modal Process (Enhanced)
  const showProcessModal = ref(false)
  const processForm = ref({
    itemData: null as any,
    good: {
      qty: 0,
      locationId: ''
    },
    bad: {
      qty: 0,
      locationId: '' // Default ke lokasi Z-BAD jika ada
    },
    notes: ''
  })

  // Fetch Data Lokasi
  const fetchLocations = async () => {
    try {
      const masterData = useMasterDataStore()
      locations.value = await masterData.getLocations()
    } catch (err) {
      console.error(err)
    }
  }

  const fetchData = async () => {
    isLoading.value = true
    try {
      const params = {
        page: currentPage.value,
        limit: currentLimit.value,
        search: searchQuery.value,
        ...filterState
      }

      let resultData: any[] = []
      let total = 0

      if (activeTab.value === 'pending') {
        // Asumsi API mengembalikan pagination di root jika params disediakan, atau kembaliannya beda
        // Karena kita update API, kita pass params
        const response = await returnApi.getPendingReturns(params)
        resultData = response?.data || response || [] // Adjust based on actual API format
        total = response?.pagination?.total || 0
      } else {
        const response = await returnApi.getReturnHistory(params)
        // Normalize history data if it returns an object of separated arrays
        if (response && !Array.isArray(response)) {
           resultData = [...(response.manual_returns || []), ...(response.marketplace_returns || [])]
           resultData.sort(
            (a, b) => new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime()
          )
        } else {
          resultData = response || []
        }
        total = response?.pagination?.total || resultData.length
      }

      // --- LOCAL FILTERING ---
      if (Array.isArray(resultData)) {
        // 1. Filter Source
        if (filterState.source && filterState.source.include && filterState.source.include.length > 0) {
          const includes = filterState.source.include.map(s => String(s).toLowerCase())
          resultData = resultData.filter(item => {
            const s = (item.source || item.type || '').toLowerCase()
            return includes.includes(s) || (s === 'manual' && includes.includes('manual'))
          })
        }

        // 2. Filter Condition (History only)
        if (filterState.condition) {
          resultData = resultData.filter(item => item.condition === filterState.condition)
        }

        // 3. Filter Location
        if (filterState.locationId) {
          const loc = locations.value.find(l => l.id === filterState.locationId)
          if (loc) {
            resultData = resultData.filter(
              item => item.location_code === loc.code || item.location_id === filterState.locationId
            )
          }
        }

        // 4. Filter Date Range
        if (filterState.startDate || filterState.endDate) {
          const start = filterState.startDate ? new Date(filterState.startDate).getTime() : 0
          const end = filterState.endDate ? new Date(filterState.endDate).getTime() : Infinity
          resultData = resultData.filter(item => {
            const itemTime = new Date(item.date || item.created_at || 0).getTime()
            return itemTime >= start && itemTime <= end
          })
        }

        // 5. Sort Order
        if (filterState.sortOrder === 'asc') {
          resultData.reverse()
        }
      }

      items.value = resultData
      totalItems.value = total || resultData.length

      // Load locations jika belum ada
      if (locations.value.length === 0) {
        await fetchLocations()
      }
    } catch (e) {
      console.error('[useReturnManager] FETCH ERROR:', e)
    } finally {
      isLoading.value = false
    }
  }

  // Reload data ketika tab atau filter diubah
  watch(
    [activeTab, filterState],
    () => {
      currentPage.value = 1
      fetchData()
    },
    { deep: true }
  )

  // Pencarian dengan debounce agar tidak spam server
  watchDebounced(
    searchQuery,
    () => {
      currentPage.value = 1
      fetchData()
    },
    { debounce: 300 }
  )

  const changePage = (p: number) => {
    doChangePage(p)
    fetchData()
  }

  const changeLimit = (l: number) => {
    doChangeLimit(l)
    fetchData()
  }

  // Buka Modal
  const openProcessModal = (item: any) => {
    processForm.value = {
      itemData: item,
      good: { qty: 0, locationId: '' },
      bad: { qty: 0, locationId: '' },
      notes: ''
    }
    showProcessModal.value = true
  }

  // Submit Logic (Smart Split)
  const submitProcess = async () => {
    const { itemData, good, bad, notes } = processForm.value
    const totalQtyInput = parseInt(good.qty as any || 0) + parseInt(bad.qty as any || 0)

    // Validasi Total
    if (totalQtyInput === 0) {
      toast('Mohon isi jumlah barang yang diterima (Bagus atau Rusak)', 'warning')
      return
    }
    if (totalQtyInput > itemData.quantity) {
      return
    }

    // Validasi Lokasi
    if (good.qty > 0 && !good.locationId) {
      toast('Pilih lokasi rak untuk barang kondisi Bagus', 'warning')
      return
    }
    if (bad.qty > 0 && !bad.locationId) {
      toast('Pilih lokasi rak untuk barang kondisi Rusak', 'warning')
      return
    }

    isLoading.value = true
    try {
      if (good.qty > 0) {
        await returnApi.approveReturn({
          itemId: itemData.id,
          qtyAccepted: good.qty,
          condition: 'GOOD',
          locationId: good.locationId,
          notes: notes
        })
      }

      if (bad.qty > 0) {
        await returnApi.approveReturn({
          itemId: itemData.id,
          qtyAccepted: bad.qty,
          condition: 'BAD',
          locationId: bad.locationId,
          notes: notes ? `${notes} (Rusak)` : ''
        })
      }

      toast('Retur berhasil divalidasi', 'success')
      showProcessModal.value = false
      fetchData() // Refresh list
    } catch (error) {
      console.error(error)
    } finally {
      isLoading.value = false
    }
  }

  return {
    activeTab,
    locations,
    isLoading,
    searchQuery,
    filterState,
    pagination,
    items,
    showProcessModal,
    processForm,
    fetchData,
    openProcessModal,
    submitProcess,
    changePage,
    changeLimit
  }
}
