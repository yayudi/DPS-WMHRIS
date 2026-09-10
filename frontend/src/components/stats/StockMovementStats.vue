<script setup>
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { dayjs } from '@/api/helpers/time.js'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast.js'
import { useTheme } from '@/composables/useTheme.js'
import { getStockMovementStatistics } from '@/api/helpers/statistics.js'
import { requestStatisticExport } from '@/api/helpers/exportStats.js'
import { useMasterDataStore } from '@/stores/masterData'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))
import { useStatsTable } from '@/composables/useStatsTable.js'
import StatsChartCard from './shared/StatsChartCard.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import StockTimelineModal from '@/components/stats/StockTimelineModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import ExportDropdown from '@/components/ui/ExportDropdown.vue'
import { formatNumber, generateDynamicExportName } from '@/utils/formatters.js'
import { usePagination } from '@/composables/usePagination.js'

const authStore = useAuthStore()
const masterData = useMasterDataStore()
const { toast } = useToast()

const isDataLoading = ref(false)
const isExporting = ref(false)
const showTimelineModal = ref(false)
const selectedProductId = ref(null)
const statisticsList = ref([])
const viewMode = ref('table')
const chartMaxCap = ref(10)

const { displayedData, sortBy, getSortIcon } = useStatsTable(statisticsList, {
  initialSortKey: 'total_sold'
})

const {
  paginatedData,
  meta: pagination,
  changePage: handleChangePage,
  changePageSize: handleUpdateLimit
} = usePagination({
  totalItems: displayedData,
  storageKey: 'stockMovementPageSize',
  initialLimit: 50
})

const filterValues = ref({
  startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
  searchQuery: '',
  status: { include: [], exclude: [] },
  movement: 'all',
  building: { include: [], exclude: [] },
  categoryId: { include: [], exclude: [] }
})

const reportFilters = ref({
  allBuildings: [],
  allCategories: []
})

const stockStatusOptions = [
  { id: 'safe', label: 'Aman' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Kritis (Restock)' },
  { id: 'overstock', label: 'Overstock' },
  { id: 'empty', label: 'Stok Kosong' },
  { id: 'negative', label: 'Stok Minus' }
]

const movementOptions = [
  { value: 'all', label: 'Semua', icon: 'fa-solid fa-list' },
  { value: 'active', label: 'Aktif', icon: 'fa-solid fa-bolt' },
  { value: 'dead', label: 'Dead Stock', icon: 'fa-solid fa-skull' }
]

const chartMaxCapOptions = [
  { id: 5, label: 'Top 5' },
  { id: 10, label: 'Top 10' },
  { id: 25, label: 'Top 25' },
  { id: 50, label: 'Top 50' }
]

const mainFilters = computed(() => [
  { type: 'daterange', keyStart: 'startDate', keyEnd: 'endDate', class: 'md:col-span-1 lg:col-span-2' },
  {
    type: 'text',
    key: 'searchQuery',
    placeholder: 'Cari SKU atau Nama Produk...',
    class: 'md:col-span-2 lg:col-span-2'
  }
])

const advancedFilters = computed(() => [
  {
    type: 'triselect',
    key: 'building',
    label: 'Lokasi / Gedung',
    options: reportFilters.value.allBuildings,
    placeholder: 'Semua Gedung',
    searchable: true
  },
  {
    type: 'triselect',
    key: 'status',
    label: 'Status Stok',
    options: stockStatusOptions,
    optionLabel: 'label',
    trackBy: 'id',
    placeholder: 'Semua Status'
  },
  {
    type: 'segmented',
    key: 'movement',
    label: 'Aktivitas Transaksi',
    options: movementOptions
  },
  {
    type: 'triselect',
    key: 'categoryId',
    label: 'Kategori Produk',
    options: reportFilters.value.allCategories,
    optionLabel: 'label',
    trackBy: 'id',
    placeholder: 'Semua Kategori',
    searchable: true
  }
])

const { themeColors, isDarkTheme, isThemeChanging } = useTheme()

onMounted(async () => {
  try {
    const res = await masterData.getReportFilters()
    if (res && res.allBuildings) {
      reportFilters.value.allBuildings = res.allBuildings
    }

    const categories = await masterData.getCategories()
    reportFilters.value.allCategories = categories.map(c => ({ id: c.id, label: c.name }))
  } catch (error) {
    console.error('Gagal memuat filter laporan', error)
  }

  fetchStatistics()
})

const canExport = computed(
  () =>
    authStore.user?.permissions?.includes('statistic.stock.export') ||
    authStore.user?.permissions?.includes('manage-all')
)

const openTimelineInvestigation = productId => {
  selectedProductId.value = productId
  showTimelineModal.value = true
}

const prepareFilters = filters => {
  const prepared = { ...filters }
  if (prepared.status && typeof prepared.status === 'object') {
    prepared.status = JSON.stringify(prepared.status)
  }
  if (prepared.building && typeof prepared.building === 'object') {
    prepared.building = JSON.stringify(prepared.building)
  }
  if (prepared.categoryId && typeof prepared.categoryId === 'object') {
    prepared.categoryId = JSON.stringify(prepared.categoryId)
  }
  return prepared
}

const fetchStatistics = async () => {
  if (!filterValues.value.startDate || !filterValues.value.endDate) return
  isDataLoading.value = true
  try {
    const response = await getStockMovementStatistics(prepareFilters(filterValues.value))
    const payload = response?.data || response // Ambil properti data asli dari Controller

    if (payload && !Array.isArray(payload) && payload.summary) {
      statisticsList.value = payload.summary || []
    } else {
      statisticsList.value = Array.isArray(payload) ? payload : []
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isDataLoading.value = false
  }
}

const handleExport = async () => {
  if (!filterValues.value.startDate || !filterValues.value.endDate) return
  isExporting.value = true
  try {
    const parts = [filterValues.value.startDate, filterValues.value.endDate]
    if (filterValues.value.movement !== 'all') parts.push(filterValues.value.movement)
    if (filterValues.value.status?.include?.length > 0)
      parts.push('status_' + filterValues.value.status.include.join('-'))
    if (filterValues.value.building?.include?.length > 0)
      parts.push('bld_' + filterValues.value.building.include.join('-'))
    if (filterValues.value.searchQuery) parts.push(filterValues.value.searchQuery)

    const exportName = generateDynamicExportName('Stock_Movement', parts)
    const filtersPayload = {
      ...filterValues.value,
      exportName
    }
    const data = await requestStatisticExport(prepareFilters(filtersPayload))
    if (data.success) {
      toast(data.message || 'Sedang memproses export ke background', 'success')
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isExporting.value = false
  }
}

const getStatusClass = status => {
  switch (status) {
    case 'NEGATIVE':
      return 'bg-accent/10 border-accent/20 text-accent'
    case 'EMPTY':
      return 'bg-text/10 border-text/20 text-text'
    case 'CRITICAL':
      return 'bg-danger/10 border-danger/20 text-danger'
    case 'WARNING':
      return 'bg-warning/10 border-warning/20 text-warning'
    case 'SAFE':
      return 'bg-success/10 border-success/20 text-success'
    case 'OVERSTOCK':
      return 'bg-primary/10 border-primary/20 text-primary'
    default:
      return 'bg-secondary/10 border-secondary/20 text-text/40'
  }
}

const getStatusLabel = status => {
  switch (status) {
    case 'CRITICAL':
      return 'Kritis'
    case 'WARNING':
      return 'Warning'
    case 'SAFE':
      return 'Aman'
    case 'OVERSTOCK':
      return 'Overstock'
    case 'EMPTY':
      return 'Kosong'
    case 'NEGATIVE':
      return 'Minus'
    default:
      return status
  }
}

const chartStatusSeries = computed(() => {
  let safe = 0,
    warning = 0,
    critical = 0,
    overstock = 0,
    empty = 0,
    negative = 0
  statisticsList.value.forEach(item => {
    if (item.status === 'SAFE') safe++
    else if (item.status === 'WARNING') warning++
    else if (item.status === 'CRITICAL') critical++
    else if (item.status === 'OVERSTOCK') overstock++
    else if (item.status === 'EMPTY') empty++
    else if (item.status === 'NEGATIVE') negative++
    else safe++ // fallback to safe if status is not recognized
  })
  return [safe, warning, critical, overstock, empty, negative]
})

const applyFilters = () => {
  fetchStatistics()
}

const labelColor = computed(() => themeColors.value.text)

const deadStockItems = computed(() => {
  if (filterValues.value.movement !== 'dead') return []
  return statisticsList.value.filter(item => item.current_stock > 0)
})

const totalDeadStockQty = computed(() => {
  return deadStockItems.value.reduce((acc, item) => acc + Number(item.current_stock), 0)
})

const chartStatusOptions = computed(() => ({
  chart: { type: 'donut', background: 'transparent' },
  labels: ['Aman', 'Warning', 'Kritis', 'Overstock', 'Kosong', 'Minus'],
  colors: [
    themeColors.value.success,
    themeColors.value.warning,
    themeColors.value.danger,
    themeColors.value.primary,
    themeColors.value.text,
    themeColors.value.accent
  ],
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  plotOptions: { pie: { donut: { size: '70%' }, expandOnClick: false } },
  dataLabels: { enabled: false },
  legend: { position: 'bottom', labels: { colors: labelColor.value } },
  stroke: { show: false }
}))

const chartTopSalesSeries = computed(() => {
  const sorted = [...statisticsList.value].sort((a, b) => b.total_sold - a.total_sold).slice(0, chartMaxCap.value)
  return [{ name: 'Keluar (Out)', data: sorted.map(i => i.total_sold) }]
})
const chartTopSalesOptions = computed(() => {
  const sorted = [...statisticsList.value].sort((a, b) => b.total_sold - a.total_sold).slice(0, chartMaxCap.value)
  return {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false } },
    xaxis: {
      categories: sorted.map(i => i.sku),
      labels: { style: { colors: labelColor.value, cssClass: 'text-[10px]' } }
    },
    yaxis: { labels: { style: { colors: labelColor.value } } },
    colors: [themeColors.value.primary],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    tooltip: {
      theme: isDarkTheme.value ? 'dark' : 'light',
      x: {
        formatter: function (val) {
          const product = statisticsList.value.find(p => p.sku === val)
          return product ? product.name : val
        }
      }
    }
  }
})

const chartSlowMovingSeries = computed(() => {
  const validData = statisticsList.value.filter(i => i.current_stock > 0)
  const sorted = validData.sort((a, b) => b.current_stock - a.current_stock).slice(0, chartMaxCap.value)
  return [{ name: 'Sisa Stok Aktual', data: sorted.map(i => i.current_stock) }]
})
const chartSlowMovingOptions = computed(() => {
  const validData = statisticsList.value.filter(i => i.current_stock > 0)
  const sorted = validData.sort((a, b) => b.current_stock - a.current_stock).slice(0, chartMaxCap.value)
  return {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    xaxis: {
      categories: sorted.map(i => i.sku),
      labels: { style: { colors: labelColor.value } }
    },
    yaxis: { labels: { style: { colors: labelColor.value, cssClass: 'text-[10px]' } } },
    colors: [themeColors.value.warning],
    theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    tooltip: {
      theme: isDarkTheme.value ? 'dark' : 'light',
      x: {
        formatter: function (val) {
          const product = statisticsList.value.find(p => p.sku === val)
          return product ? product.name : val
        }
      }
    }
  }
})

const chartActivitySeries = computed(() => {
  const sorted = [...statisticsList.value]
    .sort((a, b) => b.total_sold + b.total_inbound - (a.total_sold + a.total_inbound))
    .slice(0, chartMaxCap.value)
  return [
    { name: 'Mutasi Keluar', data: sorted.map(i => i.total_sold) },
    { name: 'Mutasi Masuk', data: sorted.map(i => i.total_inbound) }
  ]
})
const chartActivityOptions = computed(() => {
  const sorted = [...statisticsList.value]
    .sort((a, b) => b.total_sold + b.total_inbound - (a.total_sold + a.total_inbound))
    .slice(0, chartMaxCap.value)
  return {
    chart: { type: 'area', background: 'transparent', stacked: false, toolbar: { show: false } },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: sorted.map(i => i.sku),
      labels: { style: { colors: labelColor.value, cssClass: 'text-[10px]' } }
    },
    yaxis: { labels: { style: { colors: labelColor.value } } },
    colors: [themeColors.value.danger, themeColors.value.success],
    theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
    legend: { labels: { colors: labelColor.value } },
    dataLabels: { enabled: false },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] }
    },
    tooltip: {
      theme: isDarkTheme.value ? 'dark' : 'light',
      x: {
        formatter: function (val) {
          const product = statisticsList.value.find(p => p.sku === val)
          return product ? product.name : val
        }
      }
    }
  }
})

const chartFastMovingSeries = computed(() => {
  const sorted = [...statisticsList.value]
    .sort((a, b) => b.avg_daily_sales - a.avg_daily_sales)
    .slice(0, chartMaxCap.value)
  return [{ name: 'Rata-rata Keluar', data: sorted.map(i => i.avg_daily_sales) }]
})
const chartFastMovingOptions = computed(() => {
  const sorted = [...statisticsList.value]
    .sort((a, b) => b.avg_daily_sales - a.avg_daily_sales)
    .slice(0, chartMaxCap.value)
  return {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    xaxis: {
      categories: sorted.map(i => i.sku),
      labels: { style: { colors: labelColor.value, cssClass: 'text-[10px]' } }
    },
    yaxis: { labels: { style: { colors: labelColor.value } } },
    colors: [themeColors.value.accent],
    theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    tooltip: {
      theme: isDarkTheme.value ? 'dark' : 'light',
      x: {
        formatter: function (val) {
          const product = statisticsList.value.find(p => p.sku === val)
          return product ? product.name : val
        }
      }
    }
  }
})

const chartUrgentRestockSeries = computed(() => {
  const validData = statisticsList.value.filter(
    i => i.days_of_inventory !== null && i.days_of_inventory > 0 && i.days_of_inventory < 90
  )
  const sorted = validData.sort((a, b) => a.days_of_inventory - b.days_of_inventory).slice(0, chartMaxCap.value)
  return [{ name: 'Sisa Umur Stok (Hari)', data: sorted.map(i => i.days_of_inventory) }]
})
const chartUrgentRestockOptions = computed(() => {
  const validData = statisticsList.value.filter(
    i => i.days_of_inventory !== null && i.days_of_inventory > 0 && i.days_of_inventory < 90
  )
  const sorted = validData.sort((a, b) => a.days_of_inventory - b.days_of_inventory).slice(0, chartMaxCap.value)
  return {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    xaxis: {
      categories: sorted.map(i => i.sku),
      labels: { style: { colors: labelColor.value } }
    },
    yaxis: { labels: { style: { colors: labelColor.value, cssClass: 'text-[10px]' } } },
    colors: [themeColors.value.danger],
    theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    tooltip: {
      theme: isDarkTheme.value ? 'dark' : 'light',
      x: {
        formatter: function (val) {
          const product = statisticsList.value.find(p => p.sku === val)
          return product ? product.name : val
        }
      }
    }
  }
})

const chartFlowBalanceSeries = computed(() => {
  let totalIn = 0
  let totalOut = 0
  statisticsList.value.forEach(item => {
    totalIn += Number(item.total_inbound) || 0
    totalOut += Number(item.total_sold) || 0
  })
  return [totalIn, totalOut]
})
const chartFlowBalanceOptions = computed(() => ({
  chart: { type: 'donut', background: 'transparent' },
  labels: ['Total Mutasi Masuk (Inbound)', 'Total Mutasi Keluar (Out/Terjual)'],
  colors: [themeColors.value.success, themeColors.value.danger],
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  plotOptions: { pie: { donut: { size: '70%' }, expandOnClick: false } },
  dataLabels: { enabled: false },
  legend: { position: 'bottom', labels: { colors: labelColor.value } },
  stroke: { show: false }
}))

const chartScatterSeries = computed(() => {
  const safeData = []
  const warningData = []
  const criticalData = []
  const overstockData = []
  const emptyData = []
  const negativeData = []

  const source = statisticsList.value.slice(0, chartMaxCap.value > 25 ? chartMaxCap.value : 50)

  source.forEach(item => {
    const point = {
      x: item.current_stock,
      y: parseFloat(item.avg_daily_sales) || 0,
      sku: item.sku,
      name: item.name
    }
    if (item.status === 'SAFE') safeData.push(point)
    else if (item.status === 'WARNING') warningData.push(point)
    else if (item.status === 'CRITICAL') criticalData.push(point)
    else if (item.status === 'OVERSTOCK') overstockData.push(point)
    else if (item.status === 'EMPTY') emptyData.push(point)
    else if (item.status === 'NEGATIVE') negativeData.push(point)
  })

  return [
    { name: 'Kritis', data: criticalData },
    { name: 'Aman', data: safeData },
    { name: 'Warning', data: warningData },
    { name: 'Overstock', data: overstockData },
    { name: 'Kosong', data: emptyData },
    { name: 'Minus', data: negativeData }
  ]
})

const chartScatterOptions = computed(() => ({
  chart: {
    type: 'scatter',
    background: 'transparent',
    toolbar: { show: false },
    zoom: { type: 'xy' }
  },
  colors: [
    themeColors.value.danger,
    themeColors.value.success,
    themeColors.value.warning,
    themeColors.value.primary,
    themeColors.value.text,
    themeColors.value.accent
  ],
  xaxis: {
    title: {
      text: 'Sisa Stok Faktual (Pcs)',
      style: { color: labelColor.value, fontSize: '12px' }
    },
    labels: { style: { colors: labelColor.value } }
  },
  yaxis: {
    title: {
      text: 'Rata-Rata Keluar per Hari',
      style: { color: labelColor.value, fontSize: '12px' }
    },
    labels: { style: { colors: labelColor.value } }
  },
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  legend: { position: 'top', labels: { colors: labelColor.value } },
  tooltip: {
    theme: isDarkTheme.value ? 'dark' : 'light',
    custom: function ({ seriesIndex, dataPointIndex, w }) {
      const data = w.globals.initialSeries[seriesIndex].data[dataPointIndex]
      return `<div class="p-3 bg-background border border-secondary text-text text-xs rounded shadow-lg min-w-[200px]">
        <strong class="text-sm border-b border-secondary pb-1 mb-2 block">${data.sku}</strong>
        <span class="text-text/70 mb-2 block whitespace-normal leading-tight">${data.name}</span>
        <div class="flex justify-between items-center bg-secondary/20 p-1.5 rounded">
          <span>Sisa Stok Fisik:</span> <b>${data.x}</b>
        </div>
        <div class="flex justify-between items-center bg-primary/10 p-1.5 mt-1 rounded">
          <span class="text-primary">Laju Keluar Harian:</span> <b class="text-primary">${data.y}</b>
        </div>
      </div>`
    }
  }
}))
</script>

<template>
  <div class="space-y-6">
    <div
      class="mb-6 border-b border-secondary/20 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
    >
      <div>
        <h3 class="text-lg font-bold text-text">Pergerakan Stok</h3>
        <p class="text-sm text-text/50 mt-1">
          Data penjualan, inbound, dan estimasi waktu sisa stok berdasarkan rata-rata harian.
        </p>
      </div>

      <BaseTabs
        v-model="viewMode"
        :tabs="[
          { label: 'Tabel Data', value: 'table' },
          { label: 'Grafik & Insight', value: 'chart' }
        ]"
      />
    </div>
    <!-- Filter Controls -->
    <FilterBar
      v-model="filterValues"
      :filters="mainFilters"
      :advancedFilters="advancedFilters"
      @change="applyFilters"
      @clear="
        () => {
          filterValues = {
            startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
            endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
            searchQuery: '',
            status: { include: [], exclude: [] },
            movement: 'all',
            building: { include: [], exclude: [] },
            categoryId: { include: [], exclude: [] }
          }
          applyFilters()
        }
      "
    >
      <template #actions>
        <ExportDropdown
          v-if="canExport"
          @select="handleExport"
          :loading="isExporting"
          :options="[{ key: 'xlsx', label: 'Excel (.xlsx)', icon: 'fa-file-excel', iconClass: 'text-success' }]"
          class="flex-1 lg:flex-none"
          buttonClass="w-full h-[42px] inline-flex items-center justify-center rounded-md bg-success/5 px-4 py-2 text-sm font-semibold text-success shadow-sm ring-1 ring-inset ring-success/30 hover:bg-success/10 transition-color"
        />
      </template>
    </FilterBar>

    <!-- Banner Laporan Stok Mati -->
    <div
      v-if="filterValues.movement === 'dead'"
      class="bg-danger/10 border border-danger/20 rounded-xl p-5 shadow-sm animate-fade-in flex items-center gap-5"
    >
      <div class="bg-background rounded-full p-4 flex items-center justify-center border border-danger/10 shrink-0">
        <font-awesome-icon icon="fa-solid fa-skull" class="text-3xl text-danger" />
      </div>
      <div>
        <h4 class="font-bold text-danger text-lg mb-1">Peringatan: Stok Mati (Dead Stock)</h4>
        <p class="text-sm text-text/70">
          Terdapat <span class="font-bold text-text">{{ deadStockItems.length }} SKU</span> dengan total kuantitas
          <span class="font-bold text-danger">{{ formatNumber(totalDeadStockQty) }} pcs</span>
          yang menganggur tanpa ada aktivitas keluar maupun masuk pada rentang waktu ini.
        </p>
      </div>
    </div>

    <!-- Main Content Layout -->
    <div class="flex flex-col lg:flex-row gap-6 items-start">
      <!-- Table Section -->
      <main
        class="flex-1 w-full min-w-0 bg-background border border-secondary rounded-xl overflow-hidden shadow-sm"
        v-if="viewMode === 'table'"
      >
        <div class="overflow-auto max-h-[650px] custom-scrollbar">
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead
              class="bg-background border-b border-secondary sticky top-0 z-10 after:absolute after:inset-0 after:bg-secondary/20 after:-z-10"
            >
              <tr>
                <th
                  @click="sortBy('sku')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40 relative"
                  title="Kode unik produk (Stock Keeping Unit)"
                >
                  <div class="flex items-center gap-2">
                    SKU
                    <font-awesome-icon :icon="getSortIcon('sku')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('name')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40 w-full min-w-[250px]"
                  title="Nama lengkap produk"
                >
                  <div class="flex items-center gap-2">
                    Nama Produk
                    <font-awesome-icon :icon="getSortIcon('name')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('total_sold')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  title="Total barang keluar (penjualan, transfer keluar, dll) dalam rentang waktu yang dipilih"
                >
                  <div class="flex items-center gap-2">
                    Out
                    <font-awesome-icon :icon="getSortIcon('total_sold')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('total_inbound')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  title="Total barang masuk (pembelian, retur, transfer masuk, dll) dalam rentang waktu yang dipilih"
                >
                  <div class="flex items-center gap-2">
                    Inbound
                    <font-awesome-icon :icon="getSortIcon('total_inbound')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('current_stock')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  title="Jumlah stok saat ini (total di semua lokasi)"
                >
                  <div class="flex items-center gap-2">
                    Sisa Stok
                    <font-awesome-icon :icon="getSortIcon('current_stock')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('avg_daily_sales')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  title="Rata-rata barang keluar per hari (total out ÷ jumlah hari dalam rentang)"
                >
                  <div class="flex items-center gap-2">
                    Avg. Out
                    <font-awesome-icon :icon="getSortIcon('avg_daily_sales')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('days_of_inventory')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  title="Estimasi berapa hari stok akan bertahan berdasarkan rata-rata pengeluaran (Sisa Stok ÷ Avg. Out)"
                >
                  <div class="flex items-center gap-2">
                    Ketahanan
                    <font-awesome-icon :icon="getSortIcon('days_of_inventory')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('status')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40 text-center"
                  title="Status kesehatan stok: Aman (hijau), Waspada (kuning), Kritis (merah), Mati (abu-abu)"
                >
                  <div class="flex justify-center items-center gap-2">
                    Stat
                    <font-awesome-icon :icon="getSortIcon('status')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  class="px-4 py-4 font-semibold text-text/80 text-center"
                  title="Tombol aksi: lihat detail riwayat pergerakan"
                >
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20">
              <template v-if="isDataLoading">
                <tr>
                  <td colspan="9" class="text-center py-16 text-text/60">
                    <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-3xl mb-4 text-primary" />
                    <p class="font-medium">Memuat data statistik...</p>
                  </td>
                </tr>
              </template>
              <template v-else-if="displayedData.length === 0">
                <tr>
                  <td colspan="9" class="text-center py-16 text-text/60">
                    <font-awesome-icon icon="fa-solid fa-folder-open" class="text-3xl mb-4 opacity-50" />
                    <p class="font-medium">Tidak ada data untuk saringan ini.</p>
                  </td>
                </tr>
              </template>
              <template v-else>
                <tr v-for="item in paginatedData" :key="item.sku" class="hover:bg-secondary/10 transition-colors">
                  <td class="px-4 py-2 font-medium text-text bg-background/50 border-r border-secondary/10 w-auto">
                    {{ item.sku }}
                  </td>
                  <td class="px-4 py-2 w-full">
                    <div class="whitespace-normal leading-relaxed pr-4 text-text/90" :title="item.name">
                      {{ item.name }}
                    </div>
                  </td>
                  <td class="px-4 py-2 text-text/90 font-medium whitespace-nowrap">
                    {{ item.total_sold }}
                    <span v-if="item.total_sold > 0" class="text-danger text-[10px] ml-1"></span>
                  </td>
                  <td class="px-4 py-2 text-success font-medium whitespace-nowrap">
                    {{ item.total_inbound }}
                    <span v-if="item.total_inbound > 0" class="text-success text-[10px] ml-1"></span>
                  </td>
                  <td class="px-4 py-2 font-bold" :class="item.current_stock < 0 ? 'text-danger' : 'text-text'">
                    {{ item.current_stock }}
                  </td>
                  <td class="px-4 py-2 text-text/80 font-medium tracking-wide whitespace-nowrap">
                    {{ item.avg_daily_sales }}
                  </td>
                  <td class="px-4 py-2 font-medium whitespace-nowrap">
                    <span
                      v-if="item.days_of_inventory === null || item.days_of_inventory < 0"
                      class="text-text/30 font-bold tracking-widest"
                      >---</span
                    >
                    <span v-else>{{ item.days_of_inventory }}</span>
                  </td>
                  <td class="px-4 py-2 text-center min-w-[120px]">
                    <span
                      class="px-3 py-1.5 rounded-full text-[10px] font-bold border block text-center uppercase tracking-wider"
                      :class="getStatusClass(item.status)"
                    >
                      {{ getStatusLabel(item.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-center">
                    <button
                      @click="openTimelineInvestigation(item.product_id)"
                      class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-secondary/20 hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-text/50 transition-all"
                      title="Investigasi Timeline Stok"
                    >
                      <font-awesome-icon icon="fa-solid fa-clock-rotate-left" />
                    </button>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="border-t border-secondary/20 bg-secondary/5 flex flex-col sm:flex-row items-center justify-between">
          <BasePagination :pagination="pagination" @changePage="handleChangePage" @update:limit="handleUpdateLimit" />
        </div>
      </main>

      <main class="flex-1 w-full min-w-0" v-else>
        <!-- Chart Controls -->
        <div class="flex justify-end mb-4 animate-fade-in" v-if="statisticsList.length > 0">
          <div class="flex items-center gap-3 w-48">
            <span class="text-sm font-semibold text-text/70 whitespace-nowrap">Data Teratas:</span>
            <BaseSelect v-model="chartMaxCap" :options="chartMaxCapOptions" emitValue :searchable="false" />
          </div>
        </div>

        <!-- Chart Dashboard -->
        <div class="grid grid-cols-1 gap-6 animate-fade-in md:pb-12" v-if="statisticsList.length > 0">
          <!-- Card: Status Distribusi -->
          <StatsChartCard title="Distribusi Status Stok">
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="donut"
              :options="chartStatusOptions"
              :series="chartStatusSeries"
            />
          </StatsChartCard>

          <!-- Card: Top Sales -->
          <StatsChartCard :title="`Top ${chartMaxCap} Barang Paling Sering Keluar (Mutasi Out)`">
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="bar"
              :options="chartTopSalesOptions"
              :series="chartTopSalesSeries"
            />
          </StatsChartCard>

          <!-- Card: Aktivitas Tertinggi -->
          <StatsChartCard title="Volume Aktivitas: Masuk VS Keluar (Top {{ chartMaxCap }})">
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="area"
              :options="chartActivityOptions"
              :series="chartActivitySeries"
            />
          </StatsChartCard>

          <!-- Card: Dead / Slow Stock -->
          <StatsChartCard :title="`Top ${chartMaxCap} Sisa Stok Menumpuk Terbanyak (Overstock / Slow)`">
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="bar"
              :options="chartSlowMovingOptions"
              :series="chartSlowMovingSeries"
            />
          </StatsChartCard>

          <!-- Card: Fast Moving -->
          <StatsChartCard
            :title="`Top ${chartMaxCap} Laju Penjualan Terkencang (Fast-Moving)`"
            subtitle="Mengurutkan barang berdasarkan rata-rata mutasi keluar harian tertinggi."
          >
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="bar"
              :options="chartFastMovingOptions"
              :series="chartFastMovingSeries"
            />
          </StatsChartCard>

          <!-- Card: Urgent Restock -->
          <StatsChartCard
            :title="`Top ${chartMaxCap} Prioritas Restock Darurat (Kritis)`"
            subtitle='Mengurutkan barang berdasarkan sisa "hari" stok terpendek sebelum habis sepenuhnya.'
          >
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="bar"
              :options="chartUrgentRestockOptions"
              :series="chartUrgentRestockSeries"
            />
          </StatsChartCard>

          <!-- Card: Flow Balance -->
          <StatsChartCard
            title="Rasio Volume Mutasi Gudang Total (In vs Out)"
            subtitle="Menjumlahkan seluruh kuantitas Inbound vs Pengeluaran dalam periode filter ini."
          >
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="300"
              type="donut"
              :options="chartFlowBalanceOptions"
              :series="chartFlowBalanceSeries"
            />
          </StatsChartCard>

          <!-- Card: Scatter Analysis -->
          <StatsChartCard
            title="Kuadran Analisis Gudang (Sisa Stok vs Laju Penjualan)"
            subtitle="Titik di kanan bawah berarti Kritis (Stok sedikit, keluar sangat kencang). Titik di kiri atas berarti Dead Stock (Terlalu banyak stok, tidak bergerak)."
            minHeight="500px"
          >
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              height="400"
              type="scatter"
              :options="chartScatterOptions"
              :series="chartScatterSeries"
            />
          </StatsChartCard>
        </div>

        <div
          v-else
          class="bg-background border border-secondary rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
        >
          <font-awesome-icon icon="fa-solid fa-chart-pie" class="text-4xl mb-4 text-text/30" />
          <h4 class="font-bold text-text text-lg">Tidak ada data visualisasi</h4>
          <p class="text-text/60 mt-2 text-sm max-w-sm">
            Jalankan filter dan dapatkan hasil pencarian untuk mulai melihat dan menganalisis statistik berbentuk
            grafik.
          </p>
        </div>
      </main>
    </div>

    <StockTimelineModal :show="showTimelineModal" :productId="selectedProductId" @close="showTimelineModal = false" />
  </div>
</template>
