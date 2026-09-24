<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import {
  getStockMovementStatistics,
  getInventoryValueStatistics
} from '@/api/helpers/statistics.js'
import { fetchShopPerformance, fetchPackageAnalysis } from '@/api/helpers/stats.js'
import { useMasterDataStore } from '@/stores/masterData'
import { useToast } from '@/composables/useToast'
import { dayjs } from '@/api/helpers/time.js'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import FilterToggle from '@/components/ui/FilterToggle.vue'

const masterData = useMasterDataStore()
const { toast } = useToast()

const isLoading = ref(true)
const showFilters = ref(false)

// Global Filters
const buildingOptions = ref([])

const filters = ref({
  startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs().format('YYYY-MM-DD'),
  building: { include: [], exclude: [] }
})

const mainFilters = computed(() => [
  {
    type: 'daterange',
    keyStart: 'startDate',
    keyEnd: 'endDate',
    class: 'md:col-span-1 lg:col-span-2 self-end'
  },
  {
    type: 'triselect',
    key: 'building',
    label: 'Lokasi / Gedung',
    options: buildingOptions.value,
    placeholder: 'Semua Gedung',
    searchable: true,
    class: 'md:col-span-2 lg:col-span-1'
  }
])

// Data state
const kpi = ref({
  totalInventoryValue: 0,
  totalSales: 0,
  totalMovements: 0
})

// Charts Configuration
const shopPerformanceChartOptions = ref({
  chart: {
    type: 'area',
    height: 350,
    toolbar: { show: false },
    background: 'transparent'
  },
  xaxis: { categories: [] },
  colors: ['#3b82f6', '#ef4444'], // Blue for sales, Red for out movements
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth' },
  theme: { mode: 'light' },
  title: {
    text: 'Performa Toko vs Stok Keluar',
    align: 'left',
    style: { color: '#64748b' }
  }
})
const shopPerformanceSeries = ref([])

const inventoryValueChartOptions = ref({
  chart: {
    type: 'donut',
    height: 350,
    background: 'transparent'
  },
  labels: [],
  colors: ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#84cc16'],
  legend: {
    position: 'bottom',
    fontSize: '12px',
    labels: { useSeriesColors: true },
    formatter: label => {
      return label.length > 20 ? label.substring(0, 20) + '…' : label
    }
  },
  dataLabels: {
    enabled: true,
    formatter: val => `${val.toFixed(1)}%`,
    style: {
      fontSize: '12px',
      fontFamily: 'inherit',
      fontWeight: 'bold',
      dropShadow: {
        enabled: false
      }
    }
  },
  tooltip: {
    y: {
      formatter: val =>
        new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val)
    }
  },
  theme: { mode: 'light' },
  title: {
    text: 'Distribusi Nilai Inventaris',
    align: 'left',
    style: { color: '#64748b' }
  }
})
const inventoryValueSeries = ref([])

const packageAnalysisChartOptions = ref({
  chart: {
    type: 'bar',
    height: 350,
    toolbar: { show: false },
    background: 'transparent'
  },
  plotOptions: {
    bar: {
      horizontal: true,
      columnWidth: '55%',
      borderRadius: 4
    }
  },
  xaxis: { categories: [] },
  colors: ['#8b5cf6'],
  dataLabels: { enabled: false },
  theme: { mode: 'light' },
  title: {
    text: 'Top Paket Paling Laku',
    align: 'left',
    style: { color: '#64748b' }
  },
  yaxis: {
    labels: {
      show: true,
      align: 'left',
      maxWidth: 400
    }
  }
})
const packageAnalysisSeries = ref([])

const fetchData = async () => {
  isLoading.value = true
  try {
    const filterParams = { ...filters.value }

    // Fetch all in parallel, catch individually so one failure doesn't break all
    const [movementsRes, inventoryRes, shopRes, packageRes] = await Promise.allSettled([
      getStockMovementStatistics(filterParams),
      getInventoryValueStatistics(filterParams),
      fetchShopPerformance({ startDate: filterParams.startDate, endDate: filterParams.endDate }),
      fetchPackageAnalysis({ startDate: filterParams.startDate, endDate: filterParams.endDate })
    ])

    // movementsRes.data = { summary: [...] } → perlu .data.summary
    // inventoryRes.data = [...] → langsung array
    // shopRes = { summary, dailyTrend, topProducts, ... } → perlu .summary untuk KPI
    // packageRes = [...] → langsung array
    const movementsRaw = movementsRes.status === 'fulfilled' ? movementsRes.value : {}
    const inventoryData = inventoryRes.status === 'fulfilled' ? inventoryRes.value?.data || [] : []
    const shopRaw = shopRes.status === 'fulfilled' ? shopRes.value || {} : {}
    const packageData = packageRes.status === 'fulfilled' ? packageRes.value || [] : []

    const movementsSummary = movementsRaw?.data?.summary || []
    const shopSummary = shopRaw?.summary || []
    const shopDailyTrend = shopRaw?.dailyTrend || []

    processKpi(movementsSummary, inventoryData, shopSummary)
    processShopVsMovementChart(shopDailyTrend)
    processInventoryValueChart(inventoryData)
    processPackageAnalysisChart(packageData)
  } catch (error) {
    toast('Gagal memuat data dashboard analitik', 'error')
    console.error(error)
  } finally {
    isLoading.value = false
  }
}

const processKpi = (movements, inventory, shop) => {
  kpi.value.totalInventoryValue = inventory?.reduce((acc, curr) => acc + (Number(curr.total_value) || 0), 0) || 0
  kpi.value.totalSales = shop?.reduce((acc, curr) => acc + (Number(curr.total_items_sold) || 0), 0) || 0
  kpi.value.totalMovements = movements?.reduce((acc, curr) => acc + (Number(curr.total_sold) || 0), 0) || 0
}

const processShopVsMovementChart = dailyTrend => {
  // dailyTrend items: { date, totalOrders, totalItemsSold, totalRevenue }
  const sortedDates = dailyTrend.map(item => item.date).sort()

  shopPerformanceChartOptions.value = {
    ...shopPerformanceChartOptions.value,
    xaxis: { categories: sortedDates }
  }

  shopPerformanceSeries.value = [
    { name: 'Item Terjual', data: dailyTrend.sort((a, b) => a.date.localeCompare(b.date)).map(d => d.totalItemsSold) },
    { name: 'Jumlah Order', data: dailyTrend.sort((a, b) => a.date.localeCompare(b.date)).map(d => d.totalOrders) }
  ]
}

const processInventoryValueChart = inventory => {
  const categoriesMap = {}
  inventory?.forEach(item => {
    const cat = item.category || item.category_name || item.building || 'Lainnya'
    if (!categoriesMap[cat]) categoriesMap[cat] = 0
    categoriesMap[cat] += Number(item.total_value || 0)
  })

  // Limit to top 8 categories, group rest as "Lainnya"
  const sorted = Object.entries(categoriesMap).sort((a, b) => b[1] - a[1])
  const topN = 8
  const topCategories = sorted.slice(0, topN)
  const othersTotal = sorted.slice(topN).reduce((acc, [, val]) => acc + val, 0)
  if (othersTotal > 0) topCategories.push(['Lainnya', othersTotal])

  inventoryValueChartOptions.value = {
    ...inventoryValueChartOptions.value,
    labels: topCategories.map(([label]) => label)
  }
  inventoryValueSeries.value = topCategories.map(([, val]) => val)
}

const processPackageAnalysisChart = packages => {
  // Sort by highest quantity
  const sorted = (packages || [])
    .sort((a, b) => (Number(b.total_needed) || 0) - (Number(a.total_needed) || 0))
    .slice(0, 10)

  packageAnalysisChartOptions.value = {
    ...packageAnalysisChartOptions.value,
    xaxis: { categories: sorted.map(p => p.name || p.sku || 'Produk') }
  }
  packageAnalysisSeries.value = [
    {
      name: 'Total Dibutuhkan',
      data: sorted.map(p => Number(p.total_needed) || 0)
    }
  ]
}

const formatCurrency = val => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val)
}

const formatNumber = val => {
  return new Intl.NumberFormat('id-ID').format(val)
}

// Watch for dark mode changes (assuming standard tailwind 'dark' class on html)
const updateChartTheme = () => {
  const isDark = document.documentElement.classList.contains('dark')
  const theme = isDark ? 'dark' : 'light'
  const textColor = isDark ? '#cbd5e1' : '#64748b'

  shopPerformanceChartOptions.value = {
    ...shopPerformanceChartOptions.value,
    theme: { mode: theme },
    title: { ...shopPerformanceChartOptions.value.title, style: { color: textColor } }
  }
  inventoryValueChartOptions.value = {
    ...inventoryValueChartOptions.value,
    theme: { mode: theme },
    title: { ...inventoryValueChartOptions.value.title, style: { color: textColor } }
  }
  packageAnalysisChartOptions.value = {
    ...packageAnalysisChartOptions.value,
    theme: { mode: theme },
    title: { ...packageAnalysisChartOptions.value.title, style: { color: textColor } }
  }
}

onMounted(async () => {
  try {
    const res = await masterData.getReportFilters()
    buildingOptions.value = (res.allBuildings || []).map(b => b.value || b)
  } catch (err) {
    console.error('Gagal mengambil filter lokasi', err)
  }

  updateChartTheme()
  // Create an observer to watch for theme changes
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.attributeName === 'class') {
        updateChartTheme()
      }
    })
  })
  observer.observe(document.documentElement, { attributes: true })

  fetchData()
})

watch(
  filters,
  () => {
    fetchData()
  },
  { deep: true }
)
</script>

<template>
  <div class="mb-6 border-b border-secondary/20 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <h1 class="text-2xl font-bold text-primary">Dashboard Analitik Terpadu</h1>

    <div class="flex items-center w-full md:w-auto">
      <FilterToggle v-model="showFilters" />
    </div>
  </div>

  <!-- Global Filters -->
  <div v-show="showFilters" class="animate-fade-in-down mb-6">
    <FilterBar v-model="filters" :filters="mainFilters" @change="fetchData" />
  </div>

  <div v-if="isLoading" class="grid grid-cols-1 gap-6">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <BaseSkeleton class="h-28 w-full rounded-xl" />
      <BaseSkeleton class="h-28 w-full rounded-xl" />
      <BaseSkeleton class="h-28 w-full rounded-xl" />
    </div>
    <BaseSkeleton class="h-96 w-full rounded-xl" />
  </div>

  <div v-else class="space-y-6">
    <!-- KPI Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div
        class="bg-background p-6 rounded-xl shadow-sm border border-secondary/20 flex flex-col justify-center transform transition duration-300 hover:scale-105 hover:shadow-lg"
      >
        <p class="text-sm font-medium text-text/60 mb-1">Total Nilai Inventaris</p>
        <h3 class="text-2xl font-bold text-text">
          {{ formatCurrency(kpi.totalInventoryValue) }}
        </h3>
      </div>
      <div
        class="bg-background p-6 rounded-xl shadow-sm border border-secondary/20 flex flex-col justify-center transform transition duration-300 hover:scale-105 hover:shadow-lg"
      >
        <p class="text-sm font-medium text-text/60 mb-1">Total Penjualan (Qty)</p>
        <h3 class="text-2xl font-bold text-primary">{{ formatNumber(kpi.totalSales) }}</h3>
      </div>
      <div
        class="bg-background p-6 rounded-xl shadow-sm border border-secondary/20 flex flex-col justify-center transform transition duration-300 hover:scale-105 hover:shadow-lg"
      >
        <p class="text-sm font-medium text-text/60 mb-1">Total Stok Keluar (Qty)</p>
        <h3 class="text-2xl font-bold text-danger">{{ formatNumber(kpi.totalMovements) }}</h3>
      </div>
    </div>

    <!-- Charts Area -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Line Chart: Shop vs Movement -->
      <div class="lg:col-span-2 bg-background p-6 rounded-xl shadow-sm border border-secondary/20">
        <VueApexCharts
          type="area"
          height="350"
          :options="shopPerformanceChartOptions"
          :series="shopPerformanceSeries"
        />
      </div>

      <!-- Donut Chart: Inventory Value -->
      <div class="bg-background p-6 rounded-xl shadow-sm border border-secondary/20">
        <VueApexCharts type="donut" height="350" :options="inventoryValueChartOptions" :series="inventoryValueSeries" />
      </div>
    </div>

    <div class="">
      <!-- Bar Chart: Package Analysis -->
      <div class="bg-background p-6 rounded-xl shadow-sm border border-secondary/20">
        <VueApexCharts type="bar" height="350" :options="packageAnalysisChartOptions" :series="packageAnalysisSeries" />
      </div>
    </div>
  </div>
</template>
