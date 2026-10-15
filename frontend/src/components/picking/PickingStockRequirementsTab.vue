<!-- frontend/src/components/picking/PickingStockRequirementsTab.vue -->
<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { getStockRequirements, getStockRequirementOrders } from '@/api/helpers/picking.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import { useToast } from '@/composables/useToast.js'
import BasePagination from '@/components/ui/BasePagination.vue'
import PickingStockActionModal from './PickingStockActionModal.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import debounce from 'lodash/debounce'
import dayjs from 'dayjs'

const { toast } = useToast()

// --- FILTERS & LOCAL STATE ---
const searchQuery = ref('')
const debouncedSearch = ref('')
const statusFilter = ref('ALL') // 'ALL' | 'DEFICIT' | 'SUFFICIENT'
const sourceFilter = ref({ include: [], exclude: [] })
const locationFilter = ref({ include: [], exclude: [] })
const sortColumn = ref('deficit') // 'sku' | 'totalRequired' | 'totalStock' | 'deficit' | 'orderCount'
const sortDirection = ref('asc') // 'asc' | 'desc'
const expandedSkus = ref(new Set())
const isExporting = ref(false)

const handleSearchInput = debounce((val) => {
  debouncedSearch.value = val
  pagination.page = 1
}, 300)

watch(searchQuery, (val) => {
  handleSearchInput(val)
})

const pagination = reactive({
  page: 1,
  limit: 20
})



function handleSort(column) {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = column === 'sku' || column === 'deficit' ? 'asc' : 'desc'
  }
  pagination.page = 1
}

// Reset page on filter changes
watch(
  [
    statusFilter,
    () => sourceFilter.value.include,
    () => sourceFilter.value.exclude,
    () => locationFilter.value.include,
    () => locationFilter.value.exclude,
    sortColumn,
    sortDirection
  ],
  () => {
    pagination.page = 1
  },
  { deep: true }
)

// Query Params for Server-Side API
const queryParams = computed(() => {
  const params = {
    page: pagination.page,
    limit: pagination.limit,
    search: debouncedSearch.value.trim(),
    status: statusFilter.value,
    sortBy: sortColumn.value,
    sortOrder: sortDirection.value
  }

  if (sourceFilter.value.include?.length > 0 || sourceFilter.value.exclude?.length > 0) {
    params.source = JSON.stringify(sourceFilter.value)
  }

  if (locationFilter.value.include?.length > 0 || locationFilter.value.exclude?.length > 0) {
    params.locationPurpose = JSON.stringify(locationFilter.value)
  }

  return params
})

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value !== '' ||
    statusFilter.value !== 'ALL' ||
    (sourceFilter.value.include && sourceFilter.value.include.length > 0) ||
    (sourceFilter.value.exclude && sourceFilter.value.exclude.length > 0) ||
    (locationFilter.value.include && locationFilter.value.include.length > 0) ||
    (locationFilter.value.exclude && locationFilter.value.exclude.length > 0)
  )
})

function resetFilters() {
  searchQuery.value = ''
  statusFilter.value = 'ALL'
  sourceFilter.value = { include: [], exclude: [] }
  locationFilter.value = { include: [], exclude: [] }
  pagination.page = 1
}

// --- API DATA (VUE QUERY - SERVER SIDE) ---
const {
  isLoading,
  isFetching,
  data: queryData,
  refetch: refetchRequirements
} = useQuery({
  queryKey: ['pickingStockRequirements', queryParams],
  queryFn: () => getStockRequirements(queryParams.value),
  keepPreviousData: true,
  refetchOnWindowFocus: false
})

// Firebase Real-time Sync
useFirebaseSync('PICKING_LIST', 'REFRESH_PICKING', () => {
  refetchRequirements()
  expandedSkus.value.forEach((sku) => {
    fetchSkuOrders(sku, true)
  })
})

// Summary metrics from server
const summary = computed(() => {
  return (
    queryData.value?.summary || {
      totalSkus: 0,
      totalRequiredQty: 0,
      totalStockQty: 0,
      totalDeficitSkus: 0,
      totalSufficientSkus: 0
    }
  )
})

// Available sources from server
const availableSources = computed(() => queryData.value?.availableSources || [])
const sourceOptions = computed(() =>
  availableSources.value.map((src) => ({ id: src, label: src }))
)

// Available location purposes from server
const availableLocationPurposes = computed(() => queryData.value?.availableLocationPurposes || [])
const locationOptions = computed(() =>
  availableLocationPurposes.value.map((lp) => ({ id: lp, label: lp }))
)

// Displayed items for current page from server
const displayedItems = computed(() => queryData.value?.items || [])

// Pagination metadata from server
const paginationMeta = computed(() => {
  return (
    queryData.value?.pagination || {
      page: pagination.page,
      limit: pagination.limit,
      total: 0,
      totalPages: 1
    }
  )
})

// --- LAZY LOADED SKU ORDERS STATE (CHILD ACCORDION) ---
const skuOrdersState = reactive({})

function getSkuState(sku) {
  if (!skuOrdersState[sku]) {
    skuOrdersState[sku] = {
      orders: [],
      loading: false,
      error: null,
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
      sortColumn: 'orderDate',
      sortDirection: 'desc'
    }
  }
  return skuOrdersState[sku]
}

async function fetchSkuOrders(sku, force = false) {
  const state = getSkuState(sku)
  if (!force && state.orders.length > 0 && !state.loading) return

  state.loading = true
  state.error = null
  try {
    const res = await getStockRequirementOrders(sku, {
      page: state.pagination.page,
      limit: state.pagination.limit,
      sortBy: state.sortColumn,
      sortOrder: state.sortDirection
    })
    state.orders = res?.orders || []
    state.pagination = res?.pagination || state.pagination
  } catch (err) {
    console.error(`Error loading orders for ${sku}:`, err)
    state.error = err?.message || 'Gagal memuat rincian pesanan.'
    toast.error(`Gagal memuat rincian pesanan untuk ${sku}`)
  } finally {
    state.loading = false
  }
}

function toggleExpand(sku) {
  if (expandedSkus.value.has(sku)) {
    expandedSkus.value.delete(sku)
  } else {
    expandedSkus.value.add(sku)
    fetchSkuOrders(sku)
  }
}

function expandAll() {
  if (expandedSkus.value.size === displayedItems.value.length) {
    expandedSkus.value.clear()
  } else {
    displayedItems.value.forEach(item => {
      expandedSkus.value.add(item.sku)
      fetchSkuOrders(item.sku)
    })
  }
}

function handleOrderSort(sku, column) {
  const state = getSkuState(sku)
  if (state.sortColumn === column) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'
  } else {
    state.sortColumn = column
    state.sortDirection = column === 'quantity' || column === 'orderDate' ? 'desc' : 'asc'
  }
  state.pagination.page = 1
  fetchSkuOrders(sku, true)
}

function handleOrderPageChange(sku, page) {
  const state = getSkuState(sku)
  state.pagination.page = page
  fetchSkuOrders(sku, true)
}

function handleOrderLimitChange(sku, limit) {
  const state = getSkuState(sku)
  state.pagination.limit = limit
  state.pagination.page = 1
  fetchSkuOrders(sku, true)
}

// --- EXPORT TO EXCEL ---
async function exportToExcel() {
  try {
    isExporting.value = true
    const allData = await getStockRequirements({
      page: 1,
      limit: 10000,
      search: debouncedSearch.value.trim(),
      status: statusFilter.value,
      source:
        sourceFilter.value.include?.length > 0 || sourceFilter.value.exclude?.length > 0
          ? JSON.stringify(sourceFilter.value)
          : undefined,
      locationPurpose:
        locationFilter.value.include?.length > 0 || locationFilter.value.exclude?.length > 0
          ? JSON.stringify(locationFilter.value)
          : undefined,
      sortBy: sortColumn.value,
      sortOrder: sortDirection.value
    })

    const exportItems = allData?.items || []
    if (exportItems.length === 0) {
      toast.error('Tidak ada data untuk diekspor.')
      return
    }

    const XLSX = await import('xlsx')

    const summaryRows = exportItems.map((item, idx) => ({
      No: idx + 1,
      SKU: item.sku,
      'Nama Produk': item.productName || item.sku,
      'Total Kebutuhan': item.totalRequired,
      'Stok Gudang': item.totalStock,
      'Selisih / Defisit': item.deficit,
      Status: item.status === 'DEFICIT' ? 'Kurang Stok' : 'Stok Cukup',
      'Lokasi Penyimpanan':
        item.locations?.length > 0
          ? item.locations.map(l => `${l.locationCode} (${l.quantity})`).join(', ')
          : item.suggestedLocations || '-',
      'Jumlah Pesanan': item.orderCount
    }))

    const wb = XLSX.utils.book_new()
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Rekap Kebutuhan')

    const dateStr = dayjs().format('YYYY-MM-DD_HHmm')
    XLSX.writeFile(wb, `Rekap_Kebutuhan_Stok_Picking_${dateStr}.xlsx`)
    toast.success('File Excel berhasil diunduh.')
  } catch (err) {
    console.error('Export Excel failed:', err)
    toast.error('Gagal mengekspor data ke Excel.')
  } finally {
    isExporting.value = false
  }
}

// --- STOCK ACTION MODAL & DROPDOWN STATE ---
const isActionModalOpen = ref(false)
const selectedActionType = ref('TRANSFER') // 'TRANSFER' | 'REQUEST'
const activeActionItem = ref(null)
const activeActionOrder = ref(null)
const activeActionDropdown = ref(null) // 'parent-SKU' | 'child-itemId'

function toggleActionDropdown(id, event) {
  if (event) event.stopPropagation()
  activeActionDropdown.value = activeActionDropdown.value === id ? null : id
}

function closeActionDropdown() {
  activeActionDropdown.value = null
}

onMounted(() => {
  window.addEventListener('click', closeActionDropdown)
})

onUnmounted(() => {
  window.removeEventListener('click', closeActionDropdown)
})

function openActionModal(item, type, order = null) {
  activeActionDropdown.value = null
  selectedActionType.value = type
  activeActionItem.value = item
  activeActionOrder.value = order
  isActionModalOpen.value = true
}

async function handleActionSuccess({ sku }) {
  refetchRequirements()
  if (sku && expandedSkus.value.has(sku)) {
    fetchSkuOrders(sku, true)
  }
}

// Expose refetch method for parent component
defineExpose({
  refetchRequirements,
  deficitCount: computed(() => summary.value.totalDeficitSkus || 0)
})
</script>

<template>
  <div class="space-y-4">
    <!-- Top Stat Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <!-- Total SKU -->
      <div
        class="bg-secondary/10 border border-primary/30 p-4 rounded-xl shadow-sm flex items-center gap-3 transition-colors"
      >
        <div class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-lg">
          <font-awesome-icon icon="fa-solid fa-cubes-stacked" />
        </div>
        <div>
          <p class="text-xs text-primary/50 font-bold">Total SKU Dibutuhkan</p>
          <h4 class="text-xl font-bold text-text mt-0.5">
            {{ summary.totalSkus.toLocaleString('id-ID') }}
            <span class="text-xs font-normal text-text/50">SKU</span>
          </h4>
        </div>
      </div>

      <!-- Total Qty Kebutuhan -->
      <div
        class="bg-secondary/10 border border-accent/30 p-4 rounded-xl shadow-sm flex items-center gap-3 transition-colors"
      >
        <div class="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-lg">
          <font-awesome-icon icon="fa-solid fa-boxes-packing" />
        </div>
        <div>
          <p class="text-xs text-accent/50 font-bold">Total Unit Kebutuhan</p>
          <h4 class="text-xl font-bold text-text mt-0.5">
            {{ summary.totalRequiredQty.toLocaleString('id-ID') }}
            <span class="text-xs font-normal text-text/50">Unit</span>
          </h4>
        </div>
      </div>

      <!-- SKU Defisit / Kurang Stok -->
      <div
        class="bg-secondary/10 border p-4 rounded-xl shadow-sm flex items-center gap-3 transition-colors"
        :class="summary.totalDeficitSkus > 0 ? 'border-danger/30 text-danger' : 'border-secondary/20 text-text'"
      >
        <div
          class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
          :class="summary.totalDeficitSkus > 0 ? 'bg-danger/10 text-danger' : 'bg-secondary/20 text-text/40'"
        >
          <font-awesome-icon icon="fa-solid fa-circle-exclamation" />
        </div>
        <div>
          <p class="text-xs font-bold" :class="summary.totalDeficitSkus > 0 ? 'text-danger/70' : 'text-text/50'">
            SKU Kurang Stok (Defisit)
          </p>
          <h4 class="text-xl font-bold mt-0.5" :class="summary.totalDeficitSkus > 0 ? 'text-danger' : 'text-text'">
            {{ summary.totalDeficitSkus.toLocaleString('id-ID') }}
            <span class="text-xs font-normal opacity-70">SKU</span>
          </h4>
        </div>
      </div>

      <!-- SKU Stok Cukup -->
      <div
        class="bg-secondary/10 border border-success/30 p-4 rounded-xl shadow-sm flex items-center gap-3 transition-colors"
      >
        <div class="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center text-lg">
          <font-awesome-icon icon="fa-solid fa-circle-check" />
        </div>
        <div>
          <p class="text-xs text-success/50 font-bold">SKU Stok Cukup</p>
          <h4 class="text-xl font-bold text-success mt-0.5">
            {{ summary.totalSufficientSkus.toLocaleString('id-ID') }}
            <span class="text-xs font-normal text-text/50">SKU</span>
          </h4>
        </div>
      </div>
    </div>

    <!-- Filter & Toolbar Controls -->
    <div
      class="bg-background border border-secondary/20 rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3"
    >
      <!-- Search Input -->
      <div class="relative flex-1 min-w-[240px]">
        <font-awesome-icon
          icon="fa-solid fa-magnifying-glass"
          class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text/40 text-xs"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari SKU atau Nama Produk..."
          class="w-full pl-9 pr-8 py-2 bg-secondary/10 border border-secondary/20 rounded-lg text-sm text-text placeholder:text-text/40 focus:outline-none focus:border-primary transition-colors"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text/40 hover:text-text text-xs"
          title="Hapus pencarian"
        >
          <font-awesome-icon icon="fa-solid fa-xmark" />
        </button>
      </div>

      <!-- Status Filter Tabs -->
      <div
        class="flex items-center gap-1 bg-secondary/15 p-1 rounded-lg border border-secondary/20 text-xs font-semibold"
      >
        <button
          @click="statusFilter = 'ALL'"
          class="px-2.5 py-1.5 rounded-md transition-all"
          :class="statusFilter === 'ALL' ? 'bg-primary text-secondary shadow-sm' : 'text-text/60 hover:text-text'"
        >
          Semua ({{ summary.totalSkus }})
        </button>
        <button
          @click="statusFilter = 'DEFICIT'"
          class="px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5"
          :class="statusFilter === 'DEFICIT' ? 'bg-danger text-white shadow-sm' : 'text-danger hover:bg-danger/10'"
        >
          <span>Kurang Stok</span>
          <span
            v-if="summary.totalDeficitSkus > 0"
            class="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
            :class="statusFilter === 'DEFICIT' ? 'bg-white text-danger' : 'bg-danger text-white'"
          >
            {{ summary.totalDeficitSkus }}
          </span>
        </button>
        <button
          @click="statusFilter = 'SUFFICIENT'"
          class="px-2.5 py-1.5 rounded-md transition-all"
          :class="
            statusFilter === 'SUFFICIENT' ? 'bg-success text-white shadow-sm' : 'text-success hover:bg-success/10'
          "
        >
          Stok Cukup ({{ summary.totalSufficientSkus }})
        </button>
      </div>

      <!-- Marketplace Source TriState Filter -->
      <div v-if="sourceOptions.length > 0" class="w-44 h-[38px]">
        <TriStateSelect
          v-model="sourceFilter"
          :options="sourceOptions"
          label="label"
          track-by="id"
          placeholder="Marketplace"
          class="w-full h-full"
        />
      </div>

      <!-- Location Purpose TriState Filter -->
      <div v-if="locationOptions.length > 0" class="w-40 h-[38px]">
        <TriStateSelect
          v-model="locationFilter"
          :options="locationOptions"
          label="label"
          track-by="id"
          placeholder="Tujuan Lokasi"
          class="w-full h-full"
        />
      </div>

      <!-- Reset Filter Button if active -->
      <button
        v-if="hasActiveFilters"
        @click="resetFilters"
        class="h-[38px] px-3 flex items-center justify-center gap-1.5 border border-danger/30 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition-all bg-danger/5 active:scale-[0.98]"
        title="Reset Semua Filter"
      >
        <font-awesome-icon icon="fa-solid fa-rotate-right" class="text-xs" />
        <span>Reset</span>
      </button>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <button
          @click="exportToExcel"
          :disabled="isExporting || displayedItems.length === 0"
          class="px-3 py-2 bg-success/10 border border-success/30 hover:bg-success hover:text-white text-success rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
          title="Ekspor rekap kebutuhan stok ke Excel"
        >
          <font-awesome-icon
            :icon="isExporting ? 'fa-solid fa-circle-notch' : 'fa-solid fa-file-excel'"
            :spin="isExporting"
          />
          <span>{{ isExporting ? 'Mengekspor...' : 'Export Excel' }}</span>
        </button>

        <button
          @click="() => refetchRequirements()"
          :disabled="isFetching"
          class="p-2 bg-secondary/10 hover:bg-secondary/20 border border-secondary/20 rounded-lg text-text text-xs transition-all disabled:opacity-50"
          title="Segarkan data kebutuhan stok"
        >
          <font-awesome-icon icon="fa-solid fa-rotate" :spin="isFetching" />
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="bg-background border border-secondary/20 rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
    >
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-3xl text-primary mb-3" />
      <p class="text-sm font-medium text-text/60">Menganalisis kebutuhan stok picking list...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="displayedItems.length === 0"
      class="bg-background border border-secondary/20 rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
    >
      <div class="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center text-text/30 text-2xl mb-3">
        <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
      </div>
      <h4 class="font-bold text-text text-base">Tidak ada kebutuhan stok</h4>
      <p class="text-text/50 text-xs mt-1 max-w-sm">
        {{
          searchQuery || statusFilter !== 'ALL' || sourceFilter !== 'ALL'
            ? 'Tidak ditemukan produk yang cocok dengan kriteria filter Anda.'
            : 'Saat ini tidak ada item picking pending atau backorder yang membutuhkan stok.'
        }}
      </p>
    </div>

    <!-- Main Table View -->
    <div v-else class="bg-background border border-secondary/20 rounded-xl overflow-hidden shadow-sm animate-fade-in">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs whitespace-nowrap">
          <thead
            class="bg-secondary/10 border-b border-secondary/20 sticky top-0 z-10 text-text/70 uppercase font-semibold"
          >
            <tr>
              <th class="py-3 px-3 text-center w-10">
                <button
                  @click="expandAll"
                  class="text-text/50 hover:text-text transition-colors"
                  :title="expandedSkus.size === displayedItems.length ? 'Tutup Semua Rincian' : 'Buka Semua Rincian'"
                >
                  <font-awesome-icon
                    :icon="
                      expandedSkus.size === displayedItems.length
                        ? 'fa-solid fa-chevron-up'
                        : 'fa-solid fa-chevron-down'
                    "
                  />
                </button>
              </th>
              <th
                @click="handleSort('sku')"
                class="py-3 px-4 cursor-pointer select-none group hover:text-primary transition-colors"
                title="Klik untuk mengurutkan berdasarkan SKU"
              >
                <div class="flex items-center gap-1.5">
                  <span>SKU & Nama Produk</span>
                  <font-awesome-icon
                    v-if="sortColumn === 'sku'"
                    :icon="sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                    class="text-primary text-xs"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-arrows-up-down"
                    class="text-text/20 group-hover:text-text/50 text-[10px] transition-colors"
                  />
                </div>
              </th>
              <th
                @click="handleSort('totalRequired')"
                class="py-3 px-4 text-right cursor-pointer select-none group hover:text-primary transition-colors"
                title="Klik untuk mengurutkan berdasarkan Total Kebutuhan"
              >
                <div class="flex items-center justify-end gap-1.5">
                  <span>Kebutuhan</span>
                  <font-awesome-icon
                    v-if="sortColumn === 'totalRequired'"
                    :icon="sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                    class="text-primary text-xs"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-arrows-up-down"
                    class="text-text/20 group-hover:text-text/50 text-[10px] transition-colors"
                  />
                </div>
              </th>
              <th
                @click="handleSort('totalStock')"
                class="py-3 px-4 text-right cursor-pointer select-none group hover:text-primary transition-colors"
                title="Klik untuk mengurutkan berdasarkan Stok Gudang"
              >
                <div class="flex items-center justify-end gap-1.5">
                  <span>Stok Gudang</span>
                  <font-awesome-icon
                    v-if="sortColumn === 'totalStock'"
                    :icon="sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                    class="text-primary text-xs"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-arrows-up-down"
                    class="text-text/20 group-hover:text-text/50 text-[10px] transition-colors"
                  />
                </div>
              </th>
              <th
                @click="handleSort('deficit')"
                class="py-3 px-4 text-center cursor-pointer select-none group hover:text-primary transition-colors"
                title="Klik untuk mengurutkan berdasarkan Status Defisit"
              >
                <div class="flex items-center justify-center gap-1.5">
                  <span>Status & Defisit</span>
                  <font-awesome-icon
                    v-if="sortColumn === 'deficit'"
                    :icon="sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                    class="text-primary text-xs"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-arrows-up-down"
                    class="text-text/20 group-hover:text-text/50 text-[10px] transition-colors"
                  />
                </div>
              </th>
              <th class="py-3 px-4">Lokasi Fisik (Stok)</th>
              <th
                @click="handleSort('orderCount')"
                class="py-3 px-4 text-center cursor-pointer select-none group hover:text-primary transition-colors"
                title="Klik untuk mengurutkan berdasarkan Jumlah Pesanan"
              >
                <div class="flex items-center justify-center gap-1.5">
                  <span>Jml Pesanan</span>
                  <font-awesome-icon
                    v-if="sortColumn === 'orderCount'"
                    :icon="sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                    class="text-primary text-xs"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-arrows-up-down"
                    class="text-text/20 group-hover:text-text/50 text-[10px] transition-colors"
                  />
                </div>
              </th>
              <th class="py-3 px-4 text-center w-12">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/15">
            <template v-for="item in displayedItems" :key="item.sku">
              <!-- Parent Row -->
              <tr
                @click="toggleExpand(item.sku)"
                class="cursor-pointer transition-colors"
                :class="[
                  expandedSkus.has(item.sku) ? 'bg-secondary/10' : 'hover:bg-secondary/5',
                  item.status === 'DEFICIT' ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-success'
                ]"
              >
                <!-- Expand Icon -->
                <td class="py-3 px-3 text-center text-text/40">
                  <font-awesome-icon
                    :icon="expandedSkus.has(item.sku) ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"
                    class="transition-transform duration-200"
                  />
                </td>

                <!-- SKU & Product Name -->
                <td class="py-3 px-4 max-w-[280px]">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-bold text-text text-sm">{{ item.sku }}</span>
                  </div>
                  <p class="text-text/60 truncate text-xs mt-0.5" :title="item.productName">
                    {{ item.productName || item.sku }}
                  </p>
                </td>

                <!-- Total Required -->
                <td class="py-3 px-4 text-right font-bold text-sm text-text">
                  {{ item.totalRequired }}
                  <span class="text-[10px] font-normal text-text/50">Unit</span>
                </td>

                <!-- Total Warehouse Stock -->
                <td
                  class="py-3 px-4 text-right font-bold text-sm"
                  :class="item.totalStock > 0 ? 'text-text' : 'text-danger'"
                >
                  {{ item.totalStock }}
                  <span class="text-[10px] font-normal text-text/50">Unit</span>
                </td>

                <!-- Status & Deficit / Surplus -->
                <td class="py-3 px-4 text-center">
                  <span
                    v-if="item.status === 'DEFICIT'"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-danger/10 text-danger border border-danger/30"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-[10px]" />
                    Kurang {{ Math.abs(item.deficit) }} Unit
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/30"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" class="text-[10px]" />
                    Cukup (+{{ item.deficit }})
                  </span>
                </td>

                <!-- Storage Locations -->
                <td class="py-3 px-4 max-w-[220px]">
                  <div v-if="item.locations && item.locations.length > 0" class="flex flex-wrap gap-1">
                    <span
                      v-for="loc in item.locations"
                      :key="loc.locationId"
                      class="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-secondary/15 text-text border border-secondary/20"
                      :title="loc.locationName"
                    >
                      {{ loc.locationCode }}: <strong class="text-primary">{{ loc.quantity }}</strong>
                    </span>
                  </div>
                  <div v-else class="text-text/40 text-xs italic">
                    {{ item.suggestedLocations !== '-' ? item.suggestedLocations : 'Belum ada stok fisik' }}
                  </div>
                </td>

                <!-- Order Count -->
                <td class="py-3 px-4 text-center">
                  <span
                    class="px-2.5 py-1 bg-secondary/15 text-text rounded-full text-xs font-semibold border border-secondary/20"
                  >
                    {{ item.orderCount }} Pesanan
                  </span>
                </td>

                <!-- Action Dropdown CTA -->
                <td class="py-3 px-4 text-center" @click.stop>
                  <div class="relative inline-block text-left">
                    <button
                      type="button"
                      @click="toggleActionDropdown(`parent-${item.sku}`, $event)"
                      class="w-8 h-8 rounded-lg text-text/50 hover:text-text hover:bg-secondary/20 flex items-center justify-center transition-colors active:scale-95 mx-auto"
                      title="Opsi aksi stok"
                    >
                      <font-awesome-icon icon="fa-solid fa-ellipsis-vertical" class="text-sm" />
                    </button>

                    <!-- Dropdown Menu -->
                    <div
                      v-if="activeActionDropdown === `parent-${item.sku}`"
                      class="absolute right-0 mt-1 w-52 bg-background border border-secondary/25 rounded-xl shadow-xl z-30 py-1 text-left animate-fade-in"
                      @click.stop
                    >
                      <button
                        type="button"
                        @click="openActionModal(item, 'TRANSFER')"
                        class="w-full px-3 py-2 text-xs font-medium text-text hover:bg-primary/10 hover:text-primary flex items-center gap-2.5 transition-colors"
                      >
                        <font-awesome-icon icon="fa-solid fa-bolt" class="text-primary w-4" />
                        <span>Transfer Cepat ke Display</span>
                      </button>
                      <button
                        type="button"
                        @click="openActionModal(item, 'REQUEST')"
                        class="w-full px-3 py-2 text-xs font-medium text-text hover:bg-warning/10 hover:text-warning flex items-center gap-2.5 transition-colors border-t border-secondary/10"
                      >
                        <font-awesome-icon icon="fa-solid fa-clipboard-list" class="text-warning w-4" />
                        <span>Buat Permintaan Stok</span>
                      </button>
                    </div>
                  </div>
                </td>
              </tr>

              <!-- Child Accordion: Breakdown Orders & Locations -->
              <tr v-if="expandedSkus.has(item.sku)" class="bg-secondary/5">
                <td colspan="8" class="p-4 bg-secondary/5 border-b border-secondary/15">
                  <div class="space-y-3">
                    <!-- Title & Header Detail -->
                    <div class="flex items-center justify-between pb-2 border-b border-secondary/15 text-xs">
                      <div class="flex items-center gap-2">
                        <font-awesome-icon icon="fa-solid fa-list-check" class="text-primary" />
                        <span class="font-bold text-text">Daftar Pesanan yang Membutuhkan {{ item.sku }}</span>
                        <span class="text-text/50 font-normal">
                          ({{ getSkuState(item.sku).pagination.total || item.orderCount || 0 }} transaksi)
                        </span>
                      </div>
                      <div v-if="item.locations?.length > 0" class="text-text/60 text-xs flex items-center gap-1">
                        <span>Penyimpanan:</span>
                        <span class="font-semibold text-text">
                          {{ item.locations.map(l => `${l.locationCode} (${l.quantity})`).join(', ') }}
                        </span>
                      </div>
                    </div>

                    <!-- Order Details Table & Pagination -->
                    <div class="rounded-lg border border-secondary/20 bg-background overflow-hidden">
                      <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs whitespace-nowrap">
                          <thead
                            class="bg-secondary/10 border-b border-secondary/20 text-text/60 font-semibold uppercase text-[10px]"
                          >
                            <tr>
                              <th
                                @click="handleOrderSort(item.sku, 'invoiceId')"
                                class="py-2 px-3 cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan No. Invoice"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span>No. Invoice</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'invoiceId'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'source')"
                                class="py-2 px-3 cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Marketplace"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span>Marketplace</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'source'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'shopName')"
                                class="py-2 px-3 cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Toko"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span>Toko</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'shopName'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'customerName')"
                                class="py-2 px-3 cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Pelanggan"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span>Pelanggan</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'customerName'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'quantity')"
                                class="py-2 px-3 text-right cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Qty Dibutuhkan"
                              >
                                <div class="flex items-center justify-end gap-1.5">
                                  <span>Qty Dibutuhkan</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'quantity'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'itemStatus')"
                                class="py-2 px-3 text-center cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Status Item"
                              >
                                <div class="flex items-center justify-center gap-1.5">
                                  <span>Status Item</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'itemStatus'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'suggestedLocationCode')"
                                class="py-2 px-3 cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Lokasi Rekomendasi"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span>Lokasi Rekomendasi</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'suggestedLocationCode'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th
                                @click="handleOrderSort(item.sku, 'orderDate')"
                                class="py-2 px-3 cursor-pointer select-none group hover:text-primary transition-colors"
                                title="Urutkan Tanggal Order"
                              >
                                <div class="flex items-center gap-1.5">
                                  <span>Tgl Order</span>
                                  <font-awesome-icon
                                    v-if="getSkuState(item.sku).sortColumn === 'orderDate'"
                                    :icon="getSkuState(item.sku).sortDirection === 'asc' ? 'fa-solid fa-arrow-up-wide-short' : 'fa-solid fa-arrow-down-wide-short'"
                                    class="text-primary text-[10px]"
                                  />
                                  <font-awesome-icon
                                    v-else
                                    icon="fa-solid fa-arrows-up-down"
                                    class="text-text/20 group-hover:text-text/50 text-[9px] transition-colors"
                                  />
                                </div>
                              </th>
                              <th class="py-2 px-3 text-center w-12">Aksi</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-secondary/15 text-text">
                            <!-- Loading State -->
                            <tr v-if="getSkuState(item.sku).loading">
                              <td colspan="9" class="text-center py-6 text-text/60">
                                <div class="flex items-center justify-center gap-2">
                                  <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary" />
                                  <span>Memuat data pesanan...</span>
                                </div>
                              </td>
                            </tr>
                            <!-- Error State -->
                            <tr v-else-if="getSkuState(item.sku).error">
                              <td colspan="9" class="text-center py-4 text-danger">
                                <div class="flex items-center justify-center gap-2">
                                  <span>{{ getSkuState(item.sku).error }}</span>
                                  <button
                                    @click="fetchSkuOrders(item.sku, true)"
                                    class="underline font-semibold hover:text-danger/80 ml-2"
                                  >
                                    Coba Lagi
                                  </button>
                                </div>
                              </td>
                            </tr>
                            <!-- Data Rows -->
                            <template v-else>
                              <tr
                                v-for="ord in getSkuState(item.sku).orders"
                                :key="ord.itemId"
                                class="hover:bg-secondary/10 transition-colors"
                              >
                                <td class="py-2 px-3 font-mono font-bold text-primary">
                                  {{ ord.invoiceId || '-' }}
                                </td>
                                <td class="py-2 px-3 font-medium">
                                  {{ ord.source || '-' }}
                                </td>
                                <td class="py-2 px-3 text-text/80">
                                  {{ ord.shopName || '-' }}
                                </td>
                                <td class="py-2 px-3 text-text/70 truncate max-w-[150px]">
                                  {{ ord.customerName || '-' }}
                                </td>
                                <td class="py-2 px-3 text-right font-bold">{{ ord.quantity }} pcs</td>
                                <td class="py-2 px-3 text-center">
                                  <span
                                    v-if="ord.itemStatus === 'BACKORDER'"
                                    class="px-2 py-0.5 rounded text-[10px] font-bold bg-danger/10 text-danger border border-danger/20"
                                  >
                                    BACKORDER
                                  </span>
                                  <span
                                    v-else
                                    class="px-2 py-0.5 rounded text-[10px] font-semibold bg-success/10 text-success border border-success/20"
                                  >
                                    PENDING
                                  </span>
                                </td>
                                <td class="py-2 px-3 font-mono text-text/70">
                                  {{ ord.suggestedLocationCode || '-' }}
                                </td>
                                <td class="py-2 px-3 text-text/50">
                                  {{ ord.orderDate ? dayjs(ord.orderDate).format('DD/MM/YYYY') : '-' }}
                                </td>
                                <!-- Child Action CTA -->
                                <td class="py-2 px-3 text-center" @click.stop>
                                  <div class="relative inline-block text-left">
                                    <button
                                      type="button"
                                      @click="toggleActionDropdown(`child-${ord.itemId}`, $event)"
                                      class="w-7 h-7 rounded-md text-text/40 hover:text-text hover:bg-secondary/20 flex items-center justify-center transition-colors active:scale-95 mx-auto"
                                      title="Opsi aksi invoice"
                                    >
                                      <font-awesome-icon icon="fa-solid fa-ellipsis-vertical" class="text-xs" />
                                    </button>

                                    <!-- Dropdown Menu Child -->
                                    <div
                                      v-if="activeActionDropdown === `child-${ord.itemId}`"
                                      class="absolute right-0 mt-1 w-48 bg-background border border-secondary/25 rounded-xl shadow-xl z-30 py-1 text-left animate-fade-in"
                                      @click.stop
                                    >
                                      <button
                                        type="button"
                                        @click="openActionModal(item, 'TRANSFER', ord)"
                                        class="w-full px-2.5 py-1.5 text-[11px] font-medium text-text hover:bg-primary/10 hover:text-primary flex items-center gap-2 transition-colors"
                                      >
                                        <font-awesome-icon icon="fa-solid fa-bolt" class="text-primary w-3.5" />
                                        <span>Transfer ({{ ord.quantity }} pcs)</span>
                                      </button>
                                      <button
                                        type="button"
                                        @click="openActionModal(item, 'REQUEST', ord)"
                                        class="w-full px-2.5 py-1.5 text-[11px] font-medium text-text hover:bg-warning/10 hover:text-warning flex items-center gap-2 transition-colors border-t border-secondary/10"
                                      >
                                        <font-awesome-icon icon="fa-solid fa-clipboard-list" class="text-warning w-3.5" />
                                        <span>Minta ({{ ord.quantity }} pcs)</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              <tr v-if="getSkuState(item.sku).orders.length === 0">
                                <td colspan="9" class="text-center py-4 text-text/50">Tidak ada data transaksi.</td>
                              </tr>
                            </template>
                          </tbody>
                        </table>
                      </div>

                      <!-- Order Details Pagination Footer -->
                      <div
                        v-if="!getSkuState(item.sku).loading && getSkuState(item.sku).orders.length > 0"
                        class="border-t border-secondary/20"
                      >
                        <BasePagination
                          :pagination="getSkuState(item.sku).pagination"
                          :limit-options="[10, 25, 50]"
                          @change-page="page => handleOrderPageChange(item.sku, page)"
                          @update:limit="limit => handleOrderLimitChange(item.sku, limit)"
                        />
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="p-3 border-t border-secondary/20">
        <BasePagination
          :pagination="paginationMeta"
          @change-page="page => (pagination.page = page)"
          @update:limit="limit => (pagination.limit = limit)"
        />
      </div>
    </div>

    <!-- Picking Stock Action Modal -->
    <PickingStockActionModal
      :is-open="isActionModalOpen"
      :action-type="selectedActionType"
      :item-data="activeActionItem"
      :order-data="activeActionOrder"
      @close="isActionModalOpen = false"
      @success="handleActionSuccess"
    />
  </div>
</template>
