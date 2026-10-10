import { ref } from 'vue'
import api from '@/core/infrastructure/http.client'
import { useToast } from '@/composables/useToast'
import { useDownload } from '@/composables/useDownload'
import { usePagination } from '@/composables/usePagination'

export function useInvestigationFilters() {
  const { toast } = useToast()
  const { downloadBlob } = useDownload()

  const loading = ref(false)
  const results = ref([])
  const openGroups = ref([])
  const openTrx = ref([])

  const totalGroups = ref(0)
  const {
    currentPage,
    currentLimit,
    meta: paginationMeta,
    changePage: doChangePage,
    changePageSize: doChangePageSize
  } = usePagination({
    totalItems: totalGroups,
    initialLimit: 10,
    storageKey: 'investigationLimit'
  })

  const filters = ref({
    startDate: '',
    endDate: '',
    movementType: { include: ['SALE'], exclude: [] },
    includeNotes: 'Sale Ref.*Item #',
    excludeNotes: '',
    location: '',
    productName: '',
    username: '',
    plSource: { include: [], exclude: [] },
    plStatus: { include: [], exclude: [] },
    plMarketplaceStatus: '',
    plCustomer: '',
    exactQuantity: false,
    revertStatus: { include: [], exclude: [] },
    minOccurrences: '',
    maxOccurrences: '',
    minSku: '',
    maxSku: '',
    maxTimeGap: '',
    sortBy: 'LATEST',
    sortDirection: 'DESC'
  })

  const resetFilters = () => {
    const d = new Date()
    filters.value.startDate = new Date(d.setDate(d.getDate() - 30)).toISOString().split('T')[0]
    filters.value.endDate = new Date().toISOString().split('T')[0]
    filters.value.movementType = { include: ['SALE'], exclude: [] }
    filters.value.includeNotes = 'Sale Ref.*Item #'
    filters.value.excludeNotes = ''
    filters.value.location = ''
    filters.value.productName = ''
    filters.value.username = ''
    filters.value.plSource = { include: [], exclude: [] }
    filters.value.plStatus = { include: [], exclude: [] }
    filters.value.plMarketplaceStatus = ''
    filters.value.plCustomer = ''
    filters.value.exactQuantity = false
    filters.value.revertStatus = { include: [], exclude: [] }
    filters.value.minOccurrences = ''
    filters.value.maxOccurrences = ''
    filters.value.minSku = ''
    filters.value.maxSku = ''
    filters.value.maxTimeGap = ''
    filters.value.sortBy = 'LATEST'
    filters.value.sortDirection = 'DESC'

    results.value = []
    openGroups.value = []
    openTrx.value = []
  }

  const toggleGroup = idx => {
    const pos = openGroups.value.indexOf(idx)
    if (pos > -1) {
      openGroups.value.splice(pos, 1)
    } else {
      openGroups.value.push(idx)
    }
  }

  const toggleTrx = id => {
    const pos = openTrx.value.indexOf(id)
    if (pos > -1) {
      openTrx.value.splice(pos, 1)
    } else {
      openTrx.value.push(id)
    }
  }

  const fetchData = async (resetPage = true) => {
    if (resetPage) {
      currentPage.value = 1
    }
    loading.value = true
    openGroups.value = []
    openTrx.value = []
    try {
      const params = {
        ...filters.value,
        page: currentPage.value,
        limit: currentLimit.value
      }

      if (params.revertStatus && typeof params.revertStatus === 'object') {
        if (params.revertStatus.include && params.revertStatus.include.includes('REVERTED')) {
          params.revertStatus = 'REVERTED'
        } else if (params.revertStatus.exclude && params.revertStatus.exclude.includes('REVERTED')) {
          params.revertStatus = 'NOT_REVERTED'
        } else {
          params.revertStatus = ''
        }
      }

      if (params.movementType && typeof params.movementType === 'object') {
        params.movementType = JSON.stringify(params.movementType)
      }
      if (params.plSource && typeof params.plSource === 'object') {
        params.plSource = JSON.stringify(params.plSource)
      }
      if (params.plStatus && typeof params.plStatus === 'object') {
        params.plStatus = JSON.stringify(params.plStatus)
      }

      // Only send non-empty filters
      Object.keys(params).forEach(k => {
        if (params[k] === '' || params[k] === null || params[k] === undefined) delete params[k]
      })

      const response = await api.get('/investigation/duplicates', { params })
      if (response.data.success) {
        results.value = response.data.data || []
        if (response.data.meta) {
          totalGroups.value = response.data.meta.totalGroups
        }
      } else {
        toast(response.data.message || 'Gagal mengambil data.', 'error')
      }
    } catch (error) {
      console.error('Fetch error:', error)
      toast(error.response?.data?.message || 'Terjadi kesalahan pada server.', 'error')
    } finally {
      loading.value = false
    }
  }

  const changePage = newPage => {
    if (newPage > 0 && newPage <= paginationMeta.value.totalPages) {
      doChangePage(newPage)
      fetchData(false)
    }
  }

  const changePageSize = newLimit => {
    doChangePageSize(newLimit)
    fetchData(true)
  }

  return {
    filters,
    paginationMeta,
    results,
    loading,
    openGroups,
    openTrx,
    resetFilters,
    toggleGroup,
    toggleTrx,
    fetchData,
    changePage,
    changePageSize,
    downloadBlob
  }
}
