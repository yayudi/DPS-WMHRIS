<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useToast } from '@/composables/useToast.js'
import api from '@/api/axios.js'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import { formatNumber, getLocationPurposeColorClass, getLocationBuildingColorClass } from '@/utils/formatters.js'
import { useMasterDataStore } from '@/stores/masterData'
import ProductSearchSelector from '@/components/wms/transfer/ProductSearchSelector.vue'
import ExportDropdown from '@/components/ui/ExportDropdown.vue'

const masterDataStore = useMasterDataStore()
const { toast } = useToast()
const loading = ref(false)
const locationLoads = ref([])
const uniquePurposes = ref([])
const uniqueBuildingsByPurpose = ref({})
const uniqueFloorsByBuilding = ref({})
const initialLoaded = ref(false)
const expandedRows = ref([])
const detailData = ref({})
const loadingDetails = ref({})
const detailSortState = ref({})

const filters = ref({
  purpose: { include: [], exclude: [] },
  building: { include: [], exclude: [] },
  floor: { include: [], exclude: [] },
  categoryId: { include: [], exclude: [] },
  searchQuery: ''
})

const selectedProduct = ref(null)

watch(selectedProduct, newVal => {
  if (newVal) {
    filters.value.searchQuery = newVal.sku
  } else {
    filters.value.searchQuery = ''
  }
  fetchData()
})

const categoryOptions = computed(() => {
  return masterDataStore.categories.map(c => ({
    label: c.name,
    value: c.id
  }))
})

// Metrics
const totalWeight = computed(() => {
  return locationLoads.value.reduce((sum, loc) => sum + (loc.total_weight || 0), 0)
})

const totalCBM = computed(() => {
  return locationLoads.value.reduce((sum, loc) => sum + (loc.total_cbm || 0), 0)
})

const avgWeightPerLocation = computed(() => {
  if (locationLoads.value.length === 0) return 0
  return totalWeight.value / 1000 / locationLoads.value.length
})

const maxProductsInList = computed(() => {
  if (locationLoads.value.length === 0) return 0
  return Math.max(...locationLoads.value.map(l => l.total_products || 0))
})

const maxQuantityInList = computed(() => {
  if (locationLoads.value.length === 0) return 0
  return Math.max(...locationLoads.value.map(l => l.total_quantity || 0))
})

const maxWeightInList = computed(() => {
  if (locationLoads.value.length === 0) return 0
  return Math.max(...locationLoads.value.map(l => l.total_weight || 0))
})

const maxCbmInList = computed(() => {
  if (locationLoads.value.length === 0) return 0
  return Math.max(...locationLoads.value.map(l => l.total_cbm || 0))
})

const getHeatmapColor = (val, max) => {
  if (!max || max === 0) return 'bg-transparent'
  const ratio = val / max
  if (ratio >= 0.8) return 'bg-danger/20'
  if (ratio >= 0.5) return 'bg-warning/20'
  if (ratio > 0) return 'bg-success/20'
  return 'bg-transparent'
}

const sortState = ref({
  field: 'building',
  direction: 'asc'
})

const handleSort = field => {
  if (sortState.value.field === field) {
    sortState.value.direction = sortState.value.direction === 'asc' ? 'desc' : 'asc'
  } else {
    sortState.value.field = field
    sortState.value.direction = 'desc'
    if (['code', 'building', 'purpose'].includes(field)) {
      sortState.value.direction = 'asc'
    }
  }
}

const sortedLocationLoads = computed(() => {
  const data = [...locationLoads.value]
  const field = sortState.value.field
  const dir = sortState.value.direction === 'asc' ? 1 : -1

  return data.sort((a, b) => {
    let valA = a[field]
    let valB = b[field]

    // Handle nulls
    if (valA === null || valA === undefined) valA = ''
    if (valB === null || valB === undefined) valB = ''

    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * dir
    }

    return (valA > valB ? 1 : valA < valB ? -1 : 0) * dir
  })
})

const handleDetailSort = (locId, field) => {
  if (!detailSortState.value[locId]) {
    detailSortState.value[locId] = { field: 'sku', direction: 'asc' }
  }

  const state = detailSortState.value[locId]
  if (state.field === field) {
    state.direction = state.direction === 'asc' ? 'desc' : 'asc'
  } else {
    state.field = field
    state.direction = 'desc' // default desc for metrics
    if (['sku', 'name'].includes(field)) {
      state.direction = 'asc'
    }
  }
}

const getSortedDetailData = locId => {
  const data = detailData.value[locId]
  if (!data) return []

  const state = detailSortState.value[locId]
  if (!state) return data

  const field = state.field
  const dir = state.direction === 'asc' ? 1 : -1

  return [...data].sort((a, b) => {
    let valA = a[field]
    let valB = b[field]

    if (valA === null || valA === undefined) valA = ''
    if (valB === null || valB === undefined) valB = ''

    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * dir
    }

    return (valA > valB ? 1 : valA < valB ? -1 : 0) * dir
  })
}

const fetchData = async () => {
  loading.value = true
  expandedRows.value = []
  try {
    const params = {}
    if (filters.value.purpose.include.length || filters.value.purpose.exclude.length) {
      params.purpose = JSON.stringify(filters.value.purpose)
    }
    if (filters.value.building.include.length || filters.value.building.exclude.length) {
      params.building = JSON.stringify(filters.value.building)
    }
    if (filters.value.floor.include.length || filters.value.floor.exclude.length) {
      params.floor = JSON.stringify(filters.value.floor)
    }
    if (filters.value.categoryId.include.length || filters.value.categoryId.exclude.length) {
      params.categoryId = JSON.stringify(filters.value.categoryId)
    }
    if (filters.value.searchQuery) {
      params.searchQuery = filters.value.searchQuery || ''
    }

    const response = await api.get('/statistics/location-analysis', { params })
    if (response.data.success) {
      locationLoads.value = response.data.data.locationLoads || []

      // Update filter options only on initial load
      if (!initialLoaded.value) {
        const purposes = new Set()
        const buildingsByPurposeMap = {}
        const floorsByBuildingMap = {}

        locationLoads.value.forEach(loc => {
          const p = loc.purpose || 'N/A'
          purposes.add(p)

          if (!buildingsByPurposeMap[p]) buildingsByPurposeMap[p] = new Set()
          if (loc.building) {
            buildingsByPurposeMap[p].add(loc.building)
            if (!floorsByBuildingMap[loc.building]) floorsByBuildingMap[loc.building] = new Set()
            if (loc.floor) floorsByBuildingMap[loc.building].add(loc.floor)
          }
        })

        uniquePurposes.value = Array.from(purposes).sort()
        for (const p in buildingsByPurposeMap) buildingsByPurposeMap[p] = Array.from(buildingsByPurposeMap[p]).sort()
        for (const b in floorsByBuildingMap) floorsByBuildingMap[b] = Array.from(floorsByBuildingMap[b]).sort()

        uniqueBuildingsByPurpose.value = buildingsByPurposeMap
        uniqueFloorsByBuilding.value = floorsByBuildingMap
        initialLoaded.value = true
      }
    }
  } catch (error) {
    console.error('Failed to fetch location capacity analysis:', error)
    toast(error.response?.data?.message || 'Gagal memuat data statistik lokasi', 'error')
  } finally {
    loading.value = false
  }
}

const purposeOptions = computed(() => {
  return uniquePurposes.value.map(p => ({ value: p, label: p }))
})

console.log(uniquePurposes.value)

const toggleExpand = async loc => {
  const locId = loc.location_id
  const index = expandedRows.value.indexOf(locId)
  if (index > -1) {
    expandedRows.value.splice(index, 1)
  } else {
    expandedRows.value.push(locId)
    if (!detailData.value[locId]) {
      await fetchDetails(locId)
    }
  }
}

const fetchDetails = async locId => {
  loadingDetails.value[locId] = true
  try {
    const params = {}
    if (filters.value.categoryId.include.length || filters.value.categoryId.exclude.length) {
      params.categoryId = JSON.stringify(filters.value.categoryId)
    }
    if (filters.value.searchQuery) {
      params.searchQuery = filters.value.searchQuery
    }
    const response = await api.get(`/statistics/location-analysis/${locId}/details`, { params })
    if (response.data.success) {
      detailData.value[locId] = response.data.data
    }
  } catch (error) {
    console.error('Failed to fetch details:', error)
    toast('Gagal memuat detail produk', 'error')
  } finally {
    loadingDetails.value[locId] = false
  }
}

const buildingOptions = computed(() => {
  const inc = filters.value.purpose.include
  if (inc.length > 0) {
    const blds = new Set()
    inc.forEach(p => {
      if (uniqueBuildingsByPurpose.value[p]) {
        uniqueBuildingsByPurpose.value[p].forEach(b => blds.add(b))
      }
    })
    return Array.from(blds)
      .sort()
      .map(b => ({ value: b, label: b }))
  }

  const allBlds = new Set()
  Object.values(uniqueBuildingsByPurpose.value).forEach(list => list.forEach(b => allBlds.add(b)))
  return Array.from(allBlds)
    .sort()
    .map(b => ({ value: b, label: b }))
})

const floorOptions = computed(() => {
  const inc = filters.value.building.include
  if (inc.length > 0) {
    const flrs = new Set()
    inc.forEach(b => {
      if (uniqueFloorsByBuilding.value[b]) {
        uniqueFloorsByBuilding.value[b].forEach(f => flrs.add(f))
      }
    })
    return Array.from(flrs)
      .sort()
      .map(f => ({ value: f, label: f }))
  }

  const allFlrs = new Set()
  Object.values(uniqueFloorsByBuilding.value).forEach(list => list.forEach(f => allFlrs.add(f)))
  return Array.from(allFlrs)
    .sort()
    .map(f => ({ value: f, label: f }))
})

watch(
  () => filters.value.purpose,
  () => {
    filters.value.building = { include: [], exclude: [] }
  },
  { deep: true }
)

watch(
  () => filters.value.building,
  () => {
    filters.value.floor = { include: [], exclude: [] }
  },
  { deep: true }
)

const handleExport = async format => {
  try {
    const payload = {
      searchQuery: filters.value.searchQuery || '',
      exportFormat: format
    }

    console.log(payload)

    if (filters.value.categoryId.include.length || filters.value.categoryId.exclude.length) {
      payload.categoryId = JSON.stringify(filters.value.categoryId)
    }
    if (filters.value.purpose.include.length || filters.value.purpose.exclude.length) {
      payload.purpose = JSON.stringify(filters.value.purpose)
    }
    if (filters.value.building.include.length || filters.value.building.exclude.length) {
      payload.building = JSON.stringify(filters.value.building)
    }
    if (filters.value.floor.include.length || filters.value.floor.exclude.length) {
      payload.floor = JSON.stringify(filters.value.floor)
    }

    await api.post('/statistics/location-analysis/export', payload)
    toast(`Job export (${format}) berhasil dibuat. Silakan cek menu Laporan > My Export Jobs.`, 'success')
  } catch (err) {
    toast(err.response?.data?.message || 'Gagal membuat job export', 'error')
  }
}

onMounted(async () => {
  if (masterDataStore.categories.length === 0) {
    await masterDataStore.getCategories()
  }
  fetchData()
})
</script>
<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold leading-7 text-text sm:truncate sm:text-3xl sm:tracking-tight">
        Statistik Kapasitas Lokasi
      </h2>
      <div class="flex space-x-3">
        <!-- Export Dropdown -->
        <ExportDropdown
          @select="handleExport"
          :options="[
            { key: 'summary', label: 'Summary (Tabel Utama)', icon: 'fa-file-excel', iconClass: 'text-success' },
            { key: 'detailed', label: 'Detailed (Rincian SKU)', icon: 'fa-file-excel', iconClass: 'text-success' }
          ]"
        />

        <button
          @click="fetchData"
          type="button"
          class="inline-flex items-center rounded-md bg-background px-3 py-2 text-sm font-semibold text-text shadow-sm border border-secondary/30 hover:bg-secondary/5"
          :disabled="loading"
        >
          <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin -ml-1 mr-2 text-text/50" />
          <font-awesome-icon v-else icon="fa-solid fa-rotate" class="-ml-0.5 mr-1.5 text-text/40" />
          Refresh Data
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-background p-4 rounded-lg shadow-sm border border-secondary/20">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Purpose</label>
          <TriStateSelect
            v-model="filters.purpose"
            :options="purposeOptions"
            label="label"
            track-by="value"
            placeholder="Semua Purpose"
            @update:model-value="fetchData"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Gedung</label>
          <TriStateSelect
            v-model="filters.building"
            :options="buildingOptions"
            label="label"
            track-by="value"
            placeholder="Semua Gedung"
            @update:model-value="fetchData"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Lantai</label>
          <TriStateSelect
            v-model="filters.floor"
            :options="floorOptions"
            label="label"
            track-by="value"
            placeholder="Semua Lantai"
            @update:model-value="fetchData"
          />
        </div>
        <div>
          <label class="block text-sm font-medium leading-6 text-text mb-1">Kategori Produk</label>
          <TriStateSelect
            v-model="filters.categoryId"
            :options="categoryOptions"
            label="label"
            track-by="value"
            placeholder="Semua Kategori"
            @update:model-value="fetchData"
          />
        </div>
        <div class="sm:col-span-2 lg:col-span-1">
          <label class="block text-sm font-medium leading-6 text-text mb-1">Cari Produk</label>
          <ProductSearchSelector v-model="selectedProduct" placeholder="Ketik SKU atau Nama..." />
        </div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Total Lokasi Aktif</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">{{ locationLoads.length }}</dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Total Beban Berat</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">
          {{ formatNumber(totalWeight / 1000) }} <span class="text-lg font-normal text-text/50">kg</span>
        </dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Total Kubikasi</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">
          {{ formatNumber(totalCBM, 2) }} <span class="text-lg font-normal text-text/50">m³</span>
        </dd>
      </div>
      <div class="overflow-hidden rounded-lg bg-background px-4 py-5 shadow-sm border border-secondary/20 sm:p-6">
        <dt class="truncate text-sm font-medium text-text/60">Rata-rata Berat per Lokasi</dt>
        <dd class="mt-1 text-3xl font-semibold tracking-tight text-text">
          {{ formatNumber(avgWeightPerLocation, 2) }} <span class="text-lg font-normal text-text/50">kg</span>
        </dd>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6">
      <!-- Data Table: Beban Lokasi -->
      <div class="bg-background rounded-lg shadow-sm border border-secondary/20 overflow-hidden flex flex-col">
        <div
          class="px-4 py-5 sm:px-6 border-b border-secondary/20 flex flex-col sm:flex-row sm:justify-between sm:items-center"
        >
          <div>
            <h3 class="text-base font-semibold leading-6 text-text">Detail Beban Kapasitas Lokasi</h3>
            <p class="mt-1 text-sm text-text/60">Informasi berat (kg) dan kubikasi (CBM) di setiap lokasi.</p>
          </div>
        </div>
        <div class="overflow-x-auto flex-1 max-h-[800px] custom-scrollbar">
          <table class="min-w-full divide-y divide-secondary/20">
            <thead class="bg-background divide-y-2 divide-secondary sticky top-0 z-10">
              <tr>
                <th scope="col" class="py-3.5 pl-4 pr-3 text-left w-8"></th>
                <th
                  scope="col"
                  class="py-3.5 px-3 text-left text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Kode unik lokasi penyimpanan"
                  @click="handleSort('code')"
                >
                  Kode Lokasi
                  <font-awesome-icon
                    v-if="sortState.field === 'code'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="ml-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="ml-1 text-text/30 group-hover:text-text/50"
                  />
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Gedung dan lantai tempat lokasi berada"
                  @click="handleSort('building')"
                >
                  Gedung / Lantai
                  <font-awesome-icon
                    v-if="sortState.field === 'building'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="ml-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="ml-1 text-text/30 group-hover:text-text/50"
                  />
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-left text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Tujuan penggunaan atau fungsi lokasi"
                  @click="handleSort('purpose')"
                >
                  Purpose
                  <font-awesome-icon
                    v-if="sortState.field === 'purpose'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="ml-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="ml-1 text-text/30 group-hover:text-text/50"
                  />
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Jumlah jenis produk/SKU berbeda yang ada di lokasi ini"
                  @click="handleSort('total_products')"
                >
                  <font-awesome-icon
                    v-if="sortState.field === 'total_products'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="mr-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="mr-1 text-text/30 group-hover:text-text/50"
                  />
                  Jumlah SKU
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Total keseluruhan barang (kuantitas) di lokasi ini"
                  @click="handleSort('total_quantity')"
                >
                  <font-awesome-icon
                    v-if="sortState.field === 'total_quantity'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="mr-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="mr-1 text-text/30 group-hover:text-text/50"
                  />
                  Kuantitas
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Estimasi total berat barang di lokasi ini dalam kilogram (kg)"
                  @click="handleSort('total_weight')"
                >
                  <font-awesome-icon
                    v-if="sortState.field === 'total_weight'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="mr-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="mr-1 text-text/30 group-hover:text-text/50"
                  />
                  Berat (kg)
                </th>
                <th
                  scope="col"
                  class="px-3 py-3.5 text-right text-sm font-semibold text-text cursor-pointer hover:bg-secondary/10 transition-colors group select-none"
                  title="Estimasi total volume/kubikasi barang di lokasi ini dalam meter kubik (m³)"
                  @click="handleSort('total_cbm')"
                >
                  <font-awesome-icon
                    v-if="sortState.field === 'total_cbm'"
                    :icon="sortState.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'"
                    class="mr-1 text-primary"
                  />
                  <font-awesome-icon
                    v-else
                    icon="fa-solid fa-sort"
                    class="mr-1 text-text/30 group-hover:text-text/50"
                  />
                  Kubikasi (m³)
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary bg-background">
              <template v-for="loc in sortedLocationLoads" :key="loc.location_id">
                <tr class="hover:bg-secondary/5 cursor-pointer" @click="toggleExpand(loc)">
                  <td class="whitespace-nowrap p-4 text-center text-text/50">
                    <font-awesome-icon
                      :icon="
                        expandedRows.includes(loc.location_id)
                          ? 'fa-solid fa-chevron-down'
                          : 'fa-solid fa-chevron-right'
                      "
                    />
                  </td>
                  <td class="whitespace-nowrap py-4 px-3 text-sm font-medium text-text">{{ loc.code }}</td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60">
                    <span
                      class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset"
                      :class="getLocationBuildingColorClass(loc.building)"
                    >
                      {{ loc.building }} <span v-if="loc.floor" class="ml-1 opacity-75"> - Lt {{ loc.floor }}</span>
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60">
                    <span
                      class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset"
                      :class="getLocationPurposeColorClass(loc.purpose)"
                      >{{ loc.purpose || 'N/A' }}</span
                    >
                  </td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60 text-right relative">
                    <div
                      class="absolute inset-y-0 right-0 transition-all duration-500 rounded-l-md"
                      :class="getHeatmapColor(loc.total_products, maxProductsInList)"
                      :style="{
                        width: maxProductsInList > 0 ? `${(loc.total_products / maxProductsInList) * 100}%` : '0%'
                      }"
                    ></div>
                    <span class="relative z-10">{{ formatNumber(loc.total_products) }}</span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-text/60 text-right relative">
                    <div
                      class="absolute inset-y-0 right-0 transition-all duration-500 rounded-l-md"
                      :class="getHeatmapColor(loc.total_quantity, maxQuantityInList)"
                      :style="{
                        width: maxQuantityInList > 0 ? `${(loc.total_quantity / maxQuantityInList) * 100}%` : '0%'
                      }"
                    ></div>
                    <span class="relative z-10">{{ formatNumber(loc.total_quantity) }}</span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm font-medium text-text text-right relative">
                    <div
                      class="absolute inset-y-0 right-0 transition-all duration-500 rounded-l-md"
                      :class="getHeatmapColor(loc.total_weight, maxWeightInList)"
                      :style="{ width: maxWeightInList > 0 ? `${(loc.total_weight / maxWeightInList) * 100}%` : '0%' }"
                    ></div>
                    <span class="relative z-10">{{ formatNumber(loc.total_weight / 1000, 2) }}</span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm font-medium text-text text-right relative">
                    <div
                      class="absolute inset-y-0 right-0 transition-all duration-500 rounded-l-md"
                      :class="getHeatmapColor(loc.total_cbm, maxCbmInList)"
                      :style="{ width: maxCbmInList > 0 ? `${(loc.total_cbm / maxCbmInList) * 100}%` : '0%' }"
                    ></div>
                    <span class="relative z-10">{{ formatNumber(loc.total_cbm, 4) }}</span>
                  </td>
                </tr>
                <tr v-if="expandedRows.includes(loc.location_id)" class="bg-secondary/40">
                  <td colspan="8" class="p-0 border-b border-secondary/20">
                    <div class="p-4">
                      <div v-if="loadingDetails[loc.location_id]" class="text-sm text-text/50 py-2">
                        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin mr-2" /> Memuat detail
                        produk...
                      </div>
                      <table
                        v-else-if="detailData[loc.location_id] && detailData[loc.location_id].length"
                        class="min-w-full divide-y divide-secondary/20 bg-background rounded-lg shadow-sm overflow-hidden border border-secondary/20"
                      >
                        <thead class="bg-secondary/10">
                          <tr>
                            <th
                              class="px-4 py-2 text-left text-xs font-semibold text-text cursor-pointer hover:bg-secondary/20 transition-colors select-none"
                              @click="handleDetailSort(loc.location_id, 'sku')"
                            >
                              SKU
                              <font-awesome-icon
                                v-if="detailSortState[loc.location_id]?.field === 'sku'"
                                :icon="
                                  detailSortState[loc.location_id]?.direction === 'asc'
                                    ? 'fa-solid fa-sort-up'
                                    : 'fa-solid fa-sort-down'
                                "
                                class="ml-1 text-primary"
                              />
                              <font-awesome-icon v-else icon="fa-solid fa-sort" class="ml-1 text-text/30" />
                            </th>
                            <th
                              class="px-4 py-2 text-left text-xs font-semibold text-text cursor-pointer hover:bg-secondary/20 transition-colors select-none"
                              @click="handleDetailSort(loc.location_id, 'name')"
                            >
                              Nama Produk
                              <font-awesome-icon
                                v-if="detailSortState[loc.location_id]?.field === 'name'"
                                :icon="
                                  detailSortState[loc.location_id]?.direction === 'asc'
                                    ? 'fa-solid fa-sort-up'
                                    : 'fa-solid fa-sort-down'
                                "
                                class="ml-1 text-primary"
                              />
                              <font-awesome-icon v-else icon="fa-solid fa-sort" class="ml-1 text-text/30" />
                            </th>
                            <th
                              class="px-4 py-2 text-right text-xs font-semibold text-text cursor-pointer hover:bg-secondary/20 transition-colors select-none"
                              @click="handleDetailSort(loc.location_id, 'quantity')"
                            >
                              <font-awesome-icon
                                v-if="detailSortState[loc.location_id]?.field === 'quantity'"
                                :icon="
                                  detailSortState[loc.location_id]?.direction === 'asc'
                                    ? 'fa-solid fa-sort-up'
                                    : 'fa-solid fa-sort-down'
                                "
                                class="mr-1 text-primary"
                              />
                              <font-awesome-icon v-else icon="fa-solid fa-sort" class="mr-1 text-text/30" />
                              Qty
                            </th>
                            <th
                              class="px-4 py-2 text-right text-xs font-semibold text-text cursor-pointer hover:bg-secondary/20 transition-colors select-none"
                              @click="handleDetailSort(loc.location_id, 'total_weight')"
                            >
                              <font-awesome-icon
                                v-if="detailSortState[loc.location_id]?.field === 'total_weight'"
                                :icon="
                                  detailSortState[loc.location_id]?.direction === 'asc'
                                    ? 'fa-solid fa-sort-up'
                                    : 'fa-solid fa-sort-down'
                                "
                                class="mr-1 text-primary"
                              />
                              <font-awesome-icon v-else icon="fa-solid fa-sort" class="mr-1 text-text/30" />
                              Berat (kg)
                            </th>
                            <th
                              class="px-4 py-2 text-right text-xs font-semibold text-text cursor-pointer hover:bg-secondary/20 transition-colors select-none"
                              @click="handleDetailSort(loc.location_id, 'total_cbm')"
                            >
                              <font-awesome-icon
                                v-if="detailSortState[loc.location_id]?.field === 'total_cbm'"
                                :icon="
                                  detailSortState[loc.location_id]?.direction === 'asc'
                                    ? 'fa-solid fa-sort-up'
                                    : 'fa-solid fa-sort-down'
                                "
                                class="mr-1 text-primary"
                              />
                              <font-awesome-icon v-else icon="fa-solid fa-sort" class="mr-1 text-text/30" />
                              Kubikasi (m³)
                            </th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-secondary/10">
                          <tr v-for="item in getSortedDetailData(loc.location_id)" :key="item.product_id">
                            <td class="px-4 py-2 text-xs text-text">{{ item.sku }}</td>
                            <td class="px-4 py-2 text-xs text-text">{{ item.name }}</td>
                            <td class="px-4 py-2 text-xs text-text text-right font-medium">
                              {{ formatNumber(item.quantity) }}
                            </td>
                            <td class="px-4 py-2 text-xs text-text text-right">
                              {{ formatNumber(item.total_weight, 2) }}
                            </td>
                            <td class="px-4 py-2 text-xs text-text text-right">
                              {{ formatNumber(item.total_cbm, 4) }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div v-else class="text-sm text-text/50 py-2">Tidak ada detail produk.</div>
                    </div>
                  </td>
                </tr>
              </template>
              <tr v-if="locationLoads.length === 0">
                <td colspan="8" class="px-3 py-8 text-sm text-text/50 text-center">
                  Tidak ada data kapasitas lokasi yang ditemukan
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
