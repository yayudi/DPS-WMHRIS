<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { dayjs } from '@/core/utils/time'
import { useI18n } from '@/core/infrastructure/localization'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useToast } from '@/core/presentation/composables/useToast'
import { useTheme } from '@/core/presentation/composables/useTheme'
import { analyticsApi } from '@/modules/analytics/infrastructure/analytics.api'
import { serializeFilterParams } from '@/core/utils/filterParams'
import { useMasterDataStore } from '@/modules/master_data/application/masterData.store'
import BaseTabs from '@/core/presentation/components/ui/BaseTabs.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))
import { useStatsTable } from '@/modules/analytics/presentation/composables/useStatsTable'
import StatsChartCard from './shared/StatsChartCard.vue'
import FilterBar from '@/core/presentation/components/ui/FilterBar.vue'
import StockTimelineModal from '@/modules/analytics/presentation/components/StockTimelineModal.vue'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import ExportDropdown from '@/core/presentation/components/ui/ExportDropdown.vue'
import FilterToggle from '@/core/presentation/components/ui/FilterToggle.vue'
import { formatNumber, generateDynamicExportName } from '@/core/utils/formatters'
import { usePagination } from '@/core/presentation/composables/usePagination'
import { useDownloadStore } from '@/core/presentation/stores/downloadStore'

const { t } = useI18n()
const authStore = useAuthStore()
const masterData = useMasterDataStore()
const downloadStore = useDownloadStore()
const { toast } = useToast()

const isDataLoading = ref(false)
const isExporting = ref(false)
const showTimelineModal = ref(false)
const selectedProductId = ref<string | number | null>(null)
const statisticsList = ref<any[]>([])
const viewMode = ref('table')
const chartMaxCap = ref(10)
const showFilters = ref(false)
const expandedRow = ref<string | null>(null)
const breakdownData = ref<Record<string | number, any[]>>({})
const breakdownLoading = ref<Record<string | number, boolean>>({})

const toggleRowExpand = async (sku: string, productId: string | number) => {
  if (expandedRow.value === sku) {
    expandedRow.value = null
    return
  }
  expandedRow.value = sku
  if (!breakdownData.value[productId]) {
    breakdownLoading.value[productId] = true
    try {
      const response = await analyticsApi.getStockBuildingBreakdown(
        productId,
        filterValues.value.startDate,
        filterValues.value.endDate
      )
      breakdownData.value[productId] = response?.data || response || []
    } catch (err) {
      console.error('Failed to fetch breakdown:', err)
      breakdownData.value[productId] = []
    } finally {
      breakdownLoading.value[productId] = false
    }
  }
}

const totalOutAll = computed(() => {
  return statisticsList.value.reduce((acc, i) => acc + Number(i.total_sold), 0)
})

const getNetFlowInfo = (item: any) => {
  const net = Number(item.total_inbound) - Number(item.total_sold)
  if (net > 0)
    return { value: `+${formatNumber(net)}`, label: t('analytics.movement.net_surplus'), class: 'text-success', icon: 'fa-solid fa-arrow-up' }
  if (net < 0)
    return { value: formatNumber(net), label: t('analytics.movement.net_deficit'), class: 'text-danger', icon: 'fa-solid fa-arrow-down' }
  return { value: '0', label: t('analytics.movement.net_balanced'), class: 'text-text/60', icon: 'fa-solid fa-minus' }
}

const getSellThroughRate = (item: any) => {
  const total = Number(item.total_sold) + Number(item.current_stock)
  if (total <= 0) return 0
  return ((Number(item.total_sold) / total) * 100).toFixed(1)
}

const getContributionPct = (item: any) => {
  if (totalOutAll.value <= 0) return '0.0'
  return ((Number(item.total_sold) / totalOutAll.value) * 100).toFixed(1)
}

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
  status: { include: [] as string[], exclude: [] as string[] },
  movement: 'all',
  building: { include: [] as string[], exclude: [] as string[] },
  categoryId: { include: [] as string[], exclude: [] as string[] }
})

const reportFilters = ref<{
  allBuildings: any[]
  allCategories: any[]
}>({
  allBuildings: [],
  allCategories: []
})

const stockStatusOptions = computed(() => [
  { id: 'safe', label: t('analytics.movement.status_safe') },
  { id: 'warning', label: t('analytics.movement.status_warning') },
  { id: 'critical', label: t('analytics.movement.status_critical') },
  { id: 'overstock', label: t('analytics.movement.status_overstock') },
  { id: 'empty', label: t('analytics.movement.status_empty') },
  { id: 'negative', label: t('analytics.movement.status_negative') }
])

const movementOptions = computed(() => [
  { value: 'all', label: t('common.filter.all'), icon: 'fa-solid fa-list' },
  { value: 'active', label: t('common.status.active'), icon: 'fa-solid fa-bolt' },
  { value: 'dead', label: t('analytics.movement.opt_dead'), icon: 'fa-solid fa-skull' }
])

const chartMaxCapOptions = [
  { id: 5, label: 'Top 5' },
  { id: 10, label: 'Top 10' },
  { id: 25, label: 'Top 25' },
  { id: 50, label: 'Top 50' }
]

const mainFilters = computed(() => [
  {
    type: 'daterange',
    keyStart: 'startDate',
    label: t('analytics.movement.filter_period'),
    keyEnd: 'endDate',
    class: 'md:col-span-1 lg:col-span-1'
  },
  {
    type: 'text',
    key: 'searchQuery',
    label: t('analytics.movement.filter_product_sku'),
    placeholder: t('common.placeholder.search_sku')
  },
  {
    type: 'triselect',
    key: 'building',
    label: t('common.label.building'),
    options: reportFilters.value.allBuildings,
    placeholder: t('common.filter.all_buildings'),
    searchable: true
  },
  {
    type: 'triselect',
    key: 'status',
    label: t('analytics.movement.filter_status'),
    options: stockStatusOptions.value,
    optionLabel: 'label',
    trackBy: 'id',
    placeholder: t('analytics.movement.filter_all_statuses')
  },
  {
    type: 'triselect',
    key: 'categoryId',
    label: t('analytics.movement.filter_category'),
    options: reportFilters.value.allCategories,
    optionLabel: 'label',
    trackBy: 'id',
    placeholder: t('analytics.movement.filter_all_categories'),
    searchable: true
  },
  {
    type: 'segmented',
    key: 'movement',
    label: t('analytics.movement.filter_activity'),
    options: movementOptions.value
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
  () => authStore.hasPermission('statistic.stock.export') || authStore.hasPermission('manage-all')
)

const openTimelineInvestigation = (productId: string | number) => {
  selectedProductId.value = productId
  showTimelineModal.value = true
}

const fetchStatistics = async () => {
  if (!filterValues.value.startDate || !filterValues.value.endDate) return
  isDataLoading.value = true
  expandedRow.value = null
  breakdownData.value = {}
  breakdownLoading.value = {}
  try {
    const response = await analyticsApi.getStockMovementStatistics(serializeFilterParams(filterValues.value))
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
    const data = await analyticsApi.requestStatisticExport(serializeFilterParams(filtersPayload))
    if (data.success) {
      downloadStore.notifyNewJob()
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
      return t('analytics.movement.status_critical_short')
    case 'WARNING':
      return t('analytics.movement.status_warning')
    case 'SAFE':
      return t('analytics.movement.status_safe')
    case 'OVERSTOCK':
      return t('analytics.movement.status_overstock')
    case 'EMPTY':
      return t('analytics.movement.status_empty_short')
    case 'NEGATIVE':
      return t('analytics.movement.status_negative_short')
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
  labels: [
    t('analytics.movement.status_safe'),
    t('analytics.movement.status_warning'),
    t('analytics.movement.status_critical_short'),
    t('analytics.movement.status_overstock'),
    t('analytics.movement.status_empty_short'),
    t('analytics.movement.status_negative_short')
  ],
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
  return [{ name: t('analytics.movement.series_out'), data: sorted.map(i => i.total_sold) }]
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
  return [{ name: t('analytics.movement.series_actual_stock'), data: sorted.map(i => i.current_stock) }]
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
    { name: t('analytics.movement.series_mutation_out'), data: sorted.map(i => i.total_sold) },
    { name: t('analytics.movement.series_mutation_in'), data: sorted.map(i => i.total_inbound) }
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
  return [{ name: t('analytics.movement.series_avg_out'), data: sorted.map(i => i.avg_daily_sales) }]
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
  return [{ name: t('analytics.movement.series_days_remaining'), data: sorted.map(i => i.days_of_inventory) }]
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
  labels: [t('analytics.movement.series_inbound_total'), t('analytics.movement.series_out_total')],
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
    { name: t('analytics.movement.status_critical_short'), data: criticalData },
    { name: t('analytics.movement.status_safe'), data: safeData },
    { name: t('analytics.movement.status_warning'), data: warningData },
    { name: t('analytics.movement.status_overstock'), data: overstockData },
    { name: t('analytics.movement.status_empty_short'), data: emptyData },
    { name: t('analytics.movement.status_negative_short'), data: negativeData }
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
      text: t('analytics.movement.axis_actual_stock'),
      style: { color: labelColor.value, fontSize: '12px' }
    },
    labels: { style: { colors: labelColor.value } }
  },
  yaxis: {
    title: {
      text: t('analytics.movement.axis_avg_out_daily'),
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
          <span>${t('analytics.movement.tooltip_physical_stock')}</span> <b>${data.x}</b>
        </div>
        <div class="flex justify-between items-center bg-primary/10 p-1.5 mt-1 rounded">
          <span class="text-primary">${t('analytics.movement.tooltip_daily_rate')}</span> <b class="text-primary">${data.y}</b>
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
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-bold text-text">{{ t('analytics.movement.page_title') }}</h3>
        </div>
        <p class="text-sm text-text/50 mt-1">
          {{ t('analytics.movement.page_subtitle') }}
        </p>
      </div>

      <div class="flex items-center gap-3 w-full md:w-auto">
        <FilterToggle v-model="showFilters" />
        <ExportDropdown
          v-if="canExport"
          @select="handleExport"
          :loading="isExporting"
          :options="[{ key: 'xlsx', label: 'Excel (.xlsx)', icon: 'fa-file-excel', iconClass: 'text-success' }]"
          buttonClass="h-[42px] inline-flex items-center justify-center rounded-md bg-success/5 px-4 py-2 text-sm font-semibold text-success shadow-sm ring-1 ring-inset ring-success/30 hover:bg-success/10 transition-colors"
        />
        <BaseTabs
          v-model="viewMode"
          :tabs="[
            { label: t('analytics.movement.tab_table'), value: 'table' },
            { label: t('analytics.movement.tab_chart'), value: 'chart' }
          ]"
        />
      </div>
    </div>
    <!-- Filter Controls -->
    <div v-show="showFilters" class="animate-fade-in-down">
      <FilterBar
        v-model="filterValues"
        :filters="mainFilters"
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
      />
    </div>

    <!-- Banner Laporan Stok Mati -->
    <div
      v-if="filterValues.movement === 'dead'"
      class="bg-danger/10 border border-danger/20 rounded-xl p-5 shadow-sm animate-fade-in flex items-center gap-5"
    >
      <div class="bg-background rounded-full p-4 flex items-center justify-center border border-danger/10 shrink-0">
        <font-awesome-icon icon="fa-solid fa-skull" class="text-3xl text-danger" />
      </div>
      <div>
        <h4 class="font-bold text-danger text-lg mb-1">{{ t('analytics.movement.dead_stock_title') }}</h4>
        <p class="text-sm text-text/70">
          {{ t('analytics.movement.dead_stock_banner', { skuCount: deadStockItems.length, totalQty: formatNumber(totalDeadStockQty) }) }}
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
                  :title="t('analytics.movement.col_sku_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('common.label.sku') }}
                    <font-awesome-icon :icon="getSortIcon('sku')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('name')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40 w-full min-w-[250px]"
                  :title="t('analytics.movement.col_name_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('common.label.product_name') }}
                    <font-awesome-icon :icon="getSortIcon('name')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('total_sold')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  :title="t('analytics.movement.col_out_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('analytics.movement.col_out') }}
                    <font-awesome-icon :icon="getSortIcon('total_sold')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('total_inbound')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  :title="t('analytics.movement.col_inbound_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('analytics.movement.col_inbound') }}
                    <font-awesome-icon :icon="getSortIcon('total_inbound')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('current_stock')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  :title="t('analytics.movement.col_stock_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('analytics.movement.col_current_stock') }}
                    <font-awesome-icon :icon="getSortIcon('current_stock')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('avg_daily_sales')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  :title="t('analytics.movement.col_avg_out_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('analytics.movement.col_avg_out') }}
                    <font-awesome-icon :icon="getSortIcon('avg_daily_sales')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('days_of_inventory')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40"
                  :title="t('analytics.movement.col_days_tooltip')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('analytics.movement.col_days_of_inventory') }}
                    <font-awesome-icon :icon="getSortIcon('days_of_inventory')" class="text-xs opacity-50" />
                  </div>
                </th>
                <th
                  @click="sortBy('status')"
                  class="px-4 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40 text-center"
                  :title="t('analytics.movement.col_status_tooltip')"
                >
                  <div class="flex justify-center items-center gap-2">
                    {{ t('analytics.movement.col_stat') }}
                    <font-awesome-icon :icon="getSortIcon('status')" class="text-xs opacity-50" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20">
              <template v-if="isDataLoading">
                <tr>
                  <td colspan="8" class="text-center py-16 text-text/60">
                    <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-3xl text-primary mb-4" />
                    <p class="text-sm">{{ t('analytics.movement.loading') }}</p>
                  </td>
                </tr>
              </template>
              <template v-else-if="statisticsList.length === 0">
                <tr>
                  <td colspan="8" class="text-center py-16 text-text/60">
                    <font-awesome-icon icon="fa-solid fa-folder-open" class="text-3xl mb-4 opacity-50" />
                    <p class="font-medium">{{ t('analytics.movement.empty_filter') }}</p>
                  </td>
                </tr>
              </template>
              <template v-else-if="displayedData.length === 0">
                <tr>
                  <td colspan="8" class="text-center py-16 text-text/60">
                    <font-awesome-icon icon="fa-solid fa-search" class="text-3xl mb-4 opacity-50" />
                    <p class="font-medium">{{ t('analytics.movement.empty_search') }}</p>
                  </td>
                </tr>
              </template>
              <template v-else>
                <template v-for="item in paginatedData" :key="item.sku">
                  <tr
                    @click="toggleRowExpand(item.sku, item.product_id)"
                    class="hover:bg-secondary/10 transition-colors cursor-pointer group"
                    :class="{ 'bg-primary/5': expandedRow === item.sku }"
                  >
                    <td class="px-4 py-2 font-medium text-text bg-background/50 border-r border-secondary/10 w-auto">
                      <div class="flex items-center gap-2">
                        <font-awesome-icon
                          icon="fa-solid fa-chevron-right"
                          class="text-[10px] text-text/30 transition-transform duration-200"
                          :class="{ 'rotate-90 text-primary': expandedRow === item.sku }"
                        />
                        {{ item.sku }}
                      </div>
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
                  </tr>
                  <!-- Expanded Detail Row -->
                  <tr v-if="expandedRow === item.sku">
                    <td colspan="8" class="p-0">
                      <div class="bg-primary/[0.03] border-t border-b border-primary/10 px-6 py-5 animate-fade-in">
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <!-- Net Flow -->
                          <div class="bg-background rounded-lg border border-secondary/20 p-3.5">
                            <div class="text-[11px] text-text/50 font-medium uppercase tracking-wider mb-1.5">
                              Net Flow
                            </div>
                            <div class="flex items-center gap-2">
                              <font-awesome-icon
                                :icon="getNetFlowInfo(item).icon"
                                :class="getNetFlowInfo(item).class"
                                class="text-sm"
                              />
                              <span class="text-lg font-bold" :class="getNetFlowInfo(item).class">{{
                                getNetFlowInfo(item).value
                              }}</span>
                            </div>
                            <div class="text-[10px] mt-1" :class="getNetFlowInfo(item).class">
                              {{ getNetFlowInfo(item).label }}
                            </div>
                          </div>
                          <!-- Sell-Through Rate -->
                          <div class="bg-background rounded-lg border border-secondary/20 p-3.5">
                            <div class="text-[11px] text-text/50 font-medium uppercase tracking-wider mb-1.5">
                              Sell-Through Rate
                            </div>
                            <div class="text-lg font-bold text-text">{{ getSellThroughRate(item) }}%</div>
                            <div class="text-[10px] text-text/40 mt-1">{{ t('analytics.movement.sell_through_sub') }}</div>
                          </div>
                          <!-- Kontribusi Out -->
                          <div class="bg-background rounded-lg border border-secondary/20 p-3.5">
                            <div class="text-[11px] text-text/50 font-medium uppercase tracking-wider mb-1.5">
                              {{ t('analytics.movement.contribution_out') }}
                            </div>
                            <div class="text-lg font-bold text-text">{{ getContributionPct(item) }}%</div>
                            <div class="text-[10px] text-text/40 mt-1">{{ t('analytics.movement.contribution_out_sub') }}</div>
                          </div>
                          <!-- Saran Restock -->
                          <div class="bg-background rounded-lg border border-secondary/20 p-3.5">
                            <div class="text-[11px] text-text/50 font-medium uppercase tracking-wider mb-1.5">
                              {{ t('analytics.movement.restock_suggestion') }}
                            </div>
                            <div
                              class="text-lg font-bold"
                              :class="Number(item.avg_daily_sales) > 0 ? 'text-accent' : 'text-text/30'"
                            >
                              {{
                                Number(item.avg_daily_sales) > 0
                                  ? formatNumber(Math.ceil(Number(item.avg_daily_sales) * 30))
                                  : '---'
                              }}
                            </div>
                            <div class="text-[10px] text-text/40 mt-1">{{ t('analytics.movement.restock_suggestion_sub') }}</div>
                          </div>
                        </div>
                        <!-- Building Breakdown Table -->
                        <div class="my-2">
                          <div
                            class="flex flex-row items-center justify-between gap-3 my-2 border-t border-secondary/10"
                          >
                            <h5
                              class="text-xs font-semibold text-text/60 uppercase tracking-wider flex items-center gap-2"
                            >
                              <font-awesome-icon icon="fa-solid fa-building" class="text-primary/60" />
                              {{ t('analytics.inventory.building_dist_title') }}
                            </h5>
                            <button
                              @click.stop="openTimelineInvestigation(item.product_id)"
                              class="inline-flex items-center justify-end gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                            >
                              <font-awesome-icon icon="fa-solid fa-clock-rotate-left" />
                              {{ t('analytics.inventory.investigate_timeline') }}
                            </button>
                          </div>
                          <div
                            v-if="breakdownLoading[item.product_id]"
                            class="flex items-center gap-2 text-text/50 text-sm py-4"
                          >
                            <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary" />
                            {{ t('analytics.inventory.loading_building') }}
                          </div>
                          <div
                            v-else-if="breakdownData[item.product_id]?.length > 0"
                            class="bg-background rounded-lg border border-secondary/20 overflow-hidden"
                          >
                            <table class="w-full text-sm">
                              <thead>
                                <tr class="bg-secondary/10 text-text/60">
                                  <th class="px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider">
                                    {{ t('common.label.building') }}
                                  </th>
                                  <th class="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wider">
                                    {{ t('analytics.inventory.col_physical_stock') }}
                                  </th>
                                  <th class="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wider">
                                    {{ t('analytics.movement.col_out') }}
                                  </th>
                                  <th class="px-3 py-2 text-right font-semibold text-xs uppercase tracking-wider">
                                    {{ t('analytics.movement.col_inbound') }}
                                  </th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-secondary/10">
                                <tr
                                  v-for="bld in breakdownData[item.product_id]"
                                  :key="bld.building"
                                  class="hover:bg-secondary/5"
                                >
                                  <td class="px-3 py-2 font-medium text-text">
                                    <div class="flex items-center gap-1.5">
                                      <font-awesome-icon
                                        icon="fa-solid fa-warehouse"
                                        class="text-[10px] text-text/30"
                                      />
                                      {{ bld.building }}
                                    </div>
                                  </td>
                                  <td
                                    class="px-3 py-2 text-right font-medium"
                                    :class="bld.current_stock < 0 ? 'text-danger' : 'text-text'"
                                  >
                                    {{ formatNumber(bld.current_stock) }}
                                  </td>
                                  <td class="px-3 py-2 text-right font-medium text-text/80">
                                    {{ formatNumber(bld.total_out) }}
                                  </td>
                                  <td class="px-3 py-2 text-right font-medium text-success">
                                    {{ formatNumber(bld.total_inbound) }}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          <div v-else class="text-text/40 text-xs py-3">
                            {{ t('analytics.inventory.no_building_dist') }}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
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
            <span class="text-sm font-semibold text-text/70 whitespace-nowrap">{{ t('analytics.inventory.display_rank') }}</span>
            <BaseSelect v-model="chartMaxCap" :options="chartMaxCapOptions" emitValue :searchable="false" />
          </div>
        </div>

        <!-- Chart Dashboard -->
        <div class="grid grid-cols-1 gap-6 animate-fade-in md:pb-12" v-if="statisticsList.length > 0">
          <!-- Card: Status Distribusi -->
          <StatsChartCard :title="t('analytics.movement.chart_status_dist')">
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
          <StatsChartCard :title="t('analytics.movement.chart_top_sales', { count: chartMaxCap })">
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
          <StatsChartCard :title="t('analytics.movement.chart_activity_title', { count: chartMaxCap })">
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
          <StatsChartCard :title="t('analytics.movement.chart_slow_stock', { count: chartMaxCap })">
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
            :title="t('analytics.movement.chart_fast_moving', { count: chartMaxCap })"
            :subtitle="t('analytics.movement.chart_fast_moving_sub')"
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
            :title="t('analytics.movement.chart_urgent_restock', { count: chartMaxCap })"
            :subtitle="t('analytics.movement.chart_urgent_restock_sub')"
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
            :title="t('analytics.movement.chart_flow_balance_title')"
            :subtitle="t('analytics.movement.chart_flow_balance_sub')"
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
            :title="t('analytics.movement.chart_scatter_title')"
            :subtitle="t('analytics.movement.chart_scatter_sub')"
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
          <h4 class="font-bold text-text text-lg">{{ t('analytics.inventory.no_visualization') }}</h4>
          <p class="text-text/60 mt-2 text-sm max-w-sm">
            {{ t('analytics.inventory.no_visualization_desc') }}
          </p>
        </div>
      </main>
    </div>

    <StockTimelineModal :show="showTimelineModal" :productId="selectedProductId" @close="showTimelineModal = false" />
  </div>
</template>
