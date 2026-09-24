<script setup>
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { dayjs } from '@/api/helpers/time.js'
import { useTheme } from '@/composables/useTheme.js'
import FilterBar from '@/components/ui/FilterBar.vue'
import FilterToggle from '@/components/ui/FilterToggle.vue'
import { fetchShopPerformance } from '@/api/helpers/stats.js'
import api from '@/api/axios'
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))
import { formatNumber, formatCurrency } from '@/utils/formatters.js'

// const { toast } = useToast()
const { themeColors, isDarkTheme, isThemeChanging } = useTheme()
const isDataLoading = ref(false)
const activeTab = ref('summary')
const showFilters = ref(false)

// Data from API
const summaryData = ref([])
const dailyTrendData = ref([])
const topProductsData = ref([])
const fulfillmentData = ref([])
const comparisonData = ref({ current: {}, previous: {}, delta: {} })
const shopOptions = ref([])

const filterValues = ref({
  reportType: 'monthly',
  year: new Date().getFullYear(),
  selectedMonth: ('0' + (new Date().getMonth() + 1)).slice(-2),
  startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
  source: { include: [], exclude: [] },
  shopName: { include: [], exclude: [] }
})

const tabs = [
  { id: 'summary', label: 'Ringkasan', icon: 'fa-solid fa-chart-pie' },
  { id: 'trend', label: 'Tren Harian', icon: 'fa-solid fa-chart-line' },
  { id: 'top-products', label: 'Produk Terlaris', icon: 'fa-solid fa-ranking-star' },
  { id: 'fulfillment', label: 'Kesehatan Pemenuhan', icon: 'fa-solid fa-heart-pulse' },
  { id: 'comparison', label: 'Perbandingan Periode', icon: 'fa-solid fa-right-left' }
]

const reportTypeOptions = [
  { value: 'monthly', label: 'Bulan', icon: 'fa-solid fa-calendar' },
  { value: 'annual', label: 'Tahun', icon: 'fa-solid fa-calendar-days' },
  { value: 'custom', label: 'Kustom', icon: 'fa-solid fa-calendar-plus' }
]

const sourceOptions = [
  { id: 'Tokopedia', label: 'Tokopedia / TikTok' },
  { id: 'Shopee', label: 'Shopee' },
  { id: 'Offline', label: 'Offline / Lainnya' }
]

const availableMonths = [
  { value: '01', label: 'Januari' },
  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' }
]

const availableYears = computed(() => {
  const current = new Date().getFullYear()
  return Array.from({ length: 7 }, (_, i) => current - 5 + i)
})

const getApiPayload = () => {
  let startDate, endDate, prevStartDate, prevEndDate
  if (filterValues.value.reportType === 'annual') {
    startDate = `${filterValues.value.year}-01-01`
    endDate = `${filterValues.value.year}-12-31`
    // Previous = year before
    const prevYear = filterValues.value.year - 1
    prevStartDate = `${prevYear}-01-01`
    prevEndDate = `${prevYear}-12-31`
  } else if (filterValues.value.reportType === 'monthly') {
    const d = new Date(`${filterValues.value.year}-${filterValues.value.selectedMonth}-02`)
    startDate = dayjs(d).startOf('month').format('YYYY-MM-DD')
    endDate = dayjs(d).endOf('month').format('YYYY-MM-DD')

    const prev = dayjs(d).subtract(1, 'month')
    prevStartDate = prev.startOf('month').format('YYYY-MM-DD')
    prevEndDate = prev.endOf('month').format('YYYY-MM-DD')
  } else {
    startDate = filterValues.value.startDate
    endDate = filterValues.value.endDate
    // For custom range, calculate same-length period before
    const startMs = new Date(startDate).getTime()
    const endMs = new Date(endDate).getTime()
    const diffMs = endMs - startMs
    prevEndDate = dayjs(startMs - 1).format('YYYY-MM-DD') // day before start
    prevStartDate = dayjs(startMs - 1 - diffMs).format('YYYY-MM-DD')
  }
  return {
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    source: filterValues.value.source,
    shopName: filterValues.value.shopName
  }
}

const mainFilters = computed(() => {
  const filters = [{ type: 'segmented', key: 'reportType', label: 'Tipe Laporan', options: reportTypeOptions }]

  if (filterValues.value.reportType === 'annual') {
    filters.push({
      type: 'select',
      key: 'year',
      label: 'Tahun',
      options: availableYears.value.map(y => ({ id: y, label: y })),
      clearable: false,
      searchable: false
    })
  } else if (filterValues.value.reportType === 'monthly') {
    filters.push({
      type: 'select',
      key: 'selectedMonth',
      label: 'Bulan',
      options: availableMonths,
      trackBy: 'value',
      clearable: false,
      searchable: false,
      placeholder: 'Pilih Bulan'
    })
    filters.push({
      type: 'select',
      key: 'year',
      label: 'Tahun',
      options: availableYears.value.map(y => ({ id: y, label: y })),
      clearable: false,
      searchable: false
    })
  } else {
    filters.push({ type: 'daterange', keyStart: 'startDate', keyEnd: 'endDate', label: 'Rentang Waktu' })
  }

  filters.push(
    {
      type: 'triselect',
      key: 'source',
      label: 'Saluran Marketplace',
      options: sourceOptions,
      optionLabel: 'label',
      trackBy: 'id',
      placeholder: 'Semua Saluran'
    },
    {
      type: 'triselect',
      key: 'shopName',
      label: 'Nama Toko / Sales',
      options: shopOptions.value,
      optionLabel: 'label',
      trackBy: 'id',
      placeholder: 'Semua Toko / Sales'
    }
  )

  return filters
})

const fetchStatistics = async () => {
  const payload = getApiPayload()
  if (!payload.startDate || !payload.endDate) return
  isDataLoading.value = true
  try {
    const response = await fetchShopPerformance(payload)
    summaryData.value = response.summary || []
    dailyTrendData.value = response.dailyTrend || []
    topProductsData.value = response.topProducts || []
    fulfillmentData.value = response.fulfillment || []
    comparisonData.value = response.comparison || { current: {}, previous: {}, delta: {} }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isDataLoading.value = false
  }
}

onMounted(async () => {
  // Fetch shop names for filter
  try {
    const res = await api.get('/sales-channels?activeOnly=true')
    if (res.data?.success) {
      const channels = res.data.data || []
      shopOptions.value = channels.map(ch => ({ id: ch.name, label: `${ch.name} (${ch.platform})` }))
    }
  } catch {
    /* silently fail, dropdown stays with 'All' */
  }
  fetchStatistics()
})
const applyFilters = () => fetchStatistics()

const labelColor = computed(() => themeColors.value.text)

// === SUMMARY TAB ===
const totalRevenueOverall = computed(() => summaryData.value.reduce((a, c) => a + c.total_revenue, 0))
const totalItemsOverall = computed(() => summaryData.value.reduce((a, c) => a + c.total_items_sold, 0))
const totalOrdersOverall = computed(() => summaryData.value.reduce((a, c) => a + c.total_orders, 0))
const aovOverall = computed(() =>
  totalOrdersOverall.value > 0 ? totalRevenueOverall.value / totalOrdersOverall.value : 0
)

const getPercentage = (val, total) => {
  if (!total) return 0
  return ((Number(val) / total) * 100).toFixed(1)
}

const pieSeries = computed(() => summaryData.value.map(s => s.total_revenue))
const pieOptions = computed(() => ({
  chart: { type: 'pie', background: 'transparent' },
  labels: summaryData.value.map(s => `${s.shop_name} (${s.source})`),
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  dataLabels: {
    enabled: true,
    style: {
      fontSize: '11px',
      fontWeight: 'bold',
      colors: isDarkTheme.value ? ['#ffffff'] : ['#000000']
    },
    dropShadow: { enabled: false },
    background: {
      enabled: true,
      foreColor: isDarkTheme.value ? '#000000' : '#ffffff',
      padding: 5,
      borderRadius: 2,
      opacity: 0.8
    },
    formatter: (val, opts) => {
      const name = opts.w.globals.labels[opts.seriesIndex]
      return name.length > 18 ? `${val.toFixed(1)}%` : `${name}\n${val.toFixed(1)}%`
    }
  },
  legend: {
    position: 'bottom',
    fontSize: '12px',
    labels: { colors: labelColor.value },
    itemMargin: { horizontal: 8, vertical: 4 }
  },
  stroke: { show: true, width: 2, colors: isDarkTheme.value ? ['#1e1e1e'] : ['#ffffff'] },
  tooltip: {
    y: { formatter: val => formatCurrency(val) }
  },
  responsive: [
    {
      breakpoint: 640,
      options: {
        legend: { position: 'bottom', fontSize: '10px' },
        dataLabels: { style: { fontSize: '9px' } }
      }
    }
  ]
}))

// === TREND TAB ===
const trendMetric = ref('omset')

const trendSeries = computed(() => {
  if (trendMetric.value === 'omset') {
    return [{ name: 'Omset (Rp)', type: 'area', data: dailyTrendData.value.map(d => d.totalRevenue) }]
  } else if (trendMetric.value === 'qty') {
    return [{ name: 'Qty Terjual', type: 'area', data: dailyTrendData.value.map(d => d.totalItemsSold) }]
  } else {
    return [{ name: 'Total Order (Resi)', type: 'area', data: dailyTrendData.value.map(d => d.totalOrders) }]
  }
})

const trendOptions = computed(() => ({
  chart: { background: 'transparent', toolbar: { show: false }, stacked: false },
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  xaxis: {
    categories: dailyTrendData.value.map(d => d.date),
    labels: { style: { colors: labelColor.value }, rotate: -45 }
  },
  yaxis: [
    {
      title: {
        text: trendMetric.value === 'omset' ? 'Omset (Rp)' : trendMetric.value === 'qty' ? 'Qty' : 'Total Order',
        style: { color: labelColor.value }
      },
      labels: {
        style: { colors: labelColor.value },
        formatter: v => (trendMetric.value === 'omset' ? formatCurrency(v) : formatNumber(v))
      }
    }
  ],
  stroke: { width: 2, curve: 'smooth' },
  fill: { type: 'gradient', opacity: 0.3 },
  legend: { show: false },
  tooltip: {
    y: { formatter: v => (trendMetric.value === 'omset' ? formatCurrency(v) : formatNumber(v)) }
  },
  grid: { borderColor: isDarkTheme.value ? '#333' : '#eee' },
  colors: [
    trendMetric.value === 'omset'
      ? themeColors.value.primary
      : trendMetric.value === 'qty'
        ? themeColors.value.warning
        : themeColors.value.success
  ]
}))

// === SOURCE BADGE ===
const sourceBadgeClass = source => {
  if (source === 'Shopee') return 'bg-[#ee4d2d]/10 text-[#ee4d2d]'
  if (source === 'Tokopedia') return 'bg-[#00AA5B]/10 text-[#00AA5B]'
  return 'bg-secondary/20 text-text/70'
}

// === COMPARISON TAB ===
const compMetrics = computed(() => [
  {
    label: 'Total Omset',
    current: comparisonData.value.current?.totalRevenue ?? 0,
    previous: comparisonData.value.previous?.totalRevenue ?? 0,
    delta: comparisonData.value.delta?.revenue ?? 0,
    format: 'currency'
  },
  {
    label: 'Total Order',
    current: comparisonData.value.current?.totalOrders ?? 0,
    previous: comparisonData.value.previous?.totalOrders ?? 0,
    delta: comparisonData.value.delta?.orders ?? 0,
    format: 'number'
  },
  {
    label: 'Qty Terjual',
    current: comparisonData.value.current?.totalItemsSold ?? 0,
    previous: comparisonData.value.previous?.totalItemsSold ?? 0,
    delta: comparisonData.value.delta?.items ?? 0,
    format: 'number'
  }
])

const compBarSeries = computed(() => [
  { name: 'Periode Ini', data: compMetrics.value.map(m => m.current) },
  { name: 'Periode Sebelumnya', data: compMetrics.value.map(m => m.previous) }
])
const compBarOptions = computed(() => ({
  chart: { type: 'bar', background: 'transparent', toolbar: { show: false } },
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4 } },
  xaxis: {
    categories: compMetrics.value.map(m => m.label),
    labels: { style: { colors: labelColor.value } }
  },
  yaxis: { labels: { style: { colors: labelColor.value }, formatter: v => formatCurrency(v) } },
  legend: { labels: { colors: labelColor.value } },
  dataLabels: { enabled: false },
  grid: { borderColor: isDarkTheme.value ? '#333' : '#eee' },
  tooltip: { y: { formatter: v => formatCurrency(v) } }
}))

const periodLabel = computed(() => {
  const f = filterValues.value
  if (f.reportType === 'annual') return { current: `${f.year}`, previous: `${f.year - 1}` }
  if (f.reportType === 'monthly') {
    const monthName = availableMonths.find(m => m.value === f.selectedMonth)?.label || f.selectedMonth
    const prevDate = dayjs(`${f.year}-${f.selectedMonth}-02`).subtract(1, 'month').toDate()
    const prevMonthName = availableMonths.find(m => m.value === ('0' + (prevDate.getMonth() + 1)).slice(-2))?.label
    return {
      current: `${monthName} ${f.year}`,
      previous: `${prevMonthName} ${prevDate.getFullYear()}`
    }
  }
  return { current: `${f.startDate} s/d ${f.endDate}`, previous: 'Periode sebelumnya' }
})
</script>

<template>
  <div class="space-y-6">
    <div
      class="mb-6 border-b border-secondary/20 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
    >
      <div>
        <h3 class="text-lg font-bold text-text">Penjualan & Performa Toko</h3>
        <p class="text-sm text-text/50 mt-1">Analitik penjualan, tren, dan kesehatan pemenuhan per toko.</p>
      </div>
      <div class="flex items-center w-full md:w-auto">
        <FilterToggle v-model="showFilters" />
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
              reportType: 'monthly',
              year: new Date().getFullYear(),
              selectedMonth: ('0' + (new Date().getMonth() + 1)).slice(-2),
              startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
              endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
              source: { include: [], exclude: [] },
              shopName: { include: [], exclude: [] }
            }
            applyFilters()
          }
        "
      />
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 bg-secondary/10 p-1 rounded-xl overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2"
        :class="
          activeTab === tab.id
            ? 'bg-background text-primary shadow-sm'
            : 'text-text/50 hover:text-text hover:bg-background/50'
        "
      >
        <font-awesome-icon :icon="tab.icon" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <main
      v-if="isDataLoading"
      class="bg-background border border-secondary rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
    >
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-4xl mb-4 text-primary" />
      <p class="font-medium text-text/60">Memuat data performa toko...</p>
    </main>

    <!-- Empty State -->
    <main
      v-else-if="summaryData.length === 0 && dailyTrendData.length === 0"
      class="bg-background border border-secondary rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
    >
      <font-awesome-icon icon="fa-solid fa-store-slash" class="text-4xl mb-4 text-text/30" />
      <h4 class="font-bold text-text text-lg">Tidak ada data penjualan toko</h4>
      <p class="text-text/60 mt-2 text-sm max-w-sm">
        Pada rentang pencarian ini, belum ada data fulfilment list yang valid ter-record.
      </p>
    </main>

    <!-- ====== TAB: RINGKASAN ====== -->
    <template v-else-if="activeTab === 'summary'">
      <!-- KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        <div class="bg-background border border-secondary rounded-xl p-5 shadow-sm">
          <p class="text-xs font-semibold text-text/50 uppercase">Total Omset</p>
          <p class="text-2xl font-bold text-primary mt-1">
            {{ formatCurrency(totalRevenueOverall) }}
          </p>
        </div>
        <div class="bg-background border border-secondary rounded-xl p-5 shadow-sm">
          <p class="text-xs font-semibold text-text/50 uppercase">Total Qty Terjual</p>
          <p class="text-2xl font-bold text-text mt-1">
            {{ formatNumber(totalItemsOverall) }} <span class="text-sm text-text/50">pcs</span>
          </p>
        </div>
        <div class="bg-background border border-secondary rounded-xl p-5 shadow-sm">
          <p class="text-xs font-semibold text-text/50 uppercase">Total Order</p>
          <p class="text-2xl font-bold text-text mt-1">{{ formatNumber(totalOrdersOverall) }}</p>
        </div>
        <div class="bg-background border border-secondary rounded-xl p-5 shadow-sm">
          <p class="text-xs font-semibold text-text/50 uppercase">Rata-rata Order (AOV)</p>
          <p class="text-2xl font-bold text-success mt-1">{{ formatCurrency(aovOverall) }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
        <!-- pie Chart -->
        <div class="bg-background border border-secondary p-5 md:p-8 rounded-xl shadow-sm w-full lg:col-span-1">
          <h4 class="font-bold text-text text-lg mb-2">Distribusi Omset</h4>
          <p class="text-xs md:text-sm text-text/50 mb-6">Pangsa omset per toko.</p>
          <div class="w-full flex justify-center">
            <VueApexCharts
              v-if="!isThemeChanging"
              width="100%"
              :height="Math.max(350, summaryData.length * 40)"
              type="pie"
              :options="pieOptions"
              :series="pieSeries"
            />
          </div>
        </div>

        <!-- Summary Table -->
        <div class="bg-background border border-secondary rounded-xl overflow-hidden shadow-sm lg:col-span-2">
          <div class="p-4 border-b border-secondary/20 flex justify-between items-center bg-secondary/5">
            <h4 class="font-bold text-text text-sm uppercase px-2">Peringkat Toko</h4>
          </div>
          <div class="overflow-auto max-h-[450px] custom-scrollbar">
            <table class="w-full text-left text-sm whitespace-nowrap">
              <thead class="bg-background border-b border-secondary sticky top-0 z-10">
                <tr>
                  <th class="px-6 py-4 font-semibold text-text/80" title="Nama toko atau cabang">Nama Toko</th>
                  <th
                    class="px-6 py-4 font-semibold text-text/80 text-center"
                    title="Platform/saluran penjualan (Online/Offline/Marketplace)"
                  >
                    Saluran
                  </th>
                  <th
                    class="px-6 py-4 font-semibold text-text/80 text-right"
                    title="Jumlah transaksi atau pesanan yang terjadi"
                  >
                    Total Order
                  </th>
                  <th
                    class="px-6 py-4 font-semibold text-text/80 text-right"
                    title="Persentase kontribusi transaksi toko ini terhadap total transaksi keseluruhan"
                  >
                    % Transaksi
                  </th>
                  <th
                    class="px-6 py-4 font-semibold text-text/80 text-right"
                    title="Total kuantitas barang yang terjual dari toko ini"
                  >
                    Qty Terjual
                  </th>
                  <th
                    class="px-6 py-4 font-semibold text-text/80 text-right"
                    title="Total pendapatan kotor dari toko ini"
                  >
                    Omset
                  </th>
                  <th
                    class="px-6 py-4 font-semibold text-text/80 text-right"
                    title="Persentase kontribusi omset toko ini terhadap total pendapatan keseluruhan"
                  >
                    % Omset
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-secondary/20">
                <tr
                  v-for="(item, index) in summaryData"
                  :key="item.shop_name + item.source"
                  class="hover:bg-secondary/10 transition-colors"
                >
                  <td class="px-6 py-4 font-medium text-text flex items-center gap-3">
                    <span
                      class="w-6 h-6 flex items-center justify-center rounded-full bg-secondary/20 text-xs font-bold text-text/50"
                      >{{ index + 1 }}</span
                    >
                    {{ item.shop_name }}
                  </td>
                  <td class="px-6 py-4 text-center">
                    <span class="px-2 py-1 rounded-md text-xs font-bold" :class="sourceBadgeClass(item.source)">{{
                      item.source
                    }}</span>
                  </td>
                  <td class="px-6 py-4 text-right font-mono">
                    {{ formatNumber(item.total_orders) }}
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <span class="text-xs font-bold">{{ getPercentage(item.total_orders, totalOrdersOverall) }}%</span>
                      <div class="w-16 h-1.5 bg-secondary/20 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-accent"
                          :style="{
                            width: `${getPercentage(item.total_orders, totalOrdersOverall)}%`
                          }"
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right font-mono">
                    {{ formatNumber(item.total_items_sold) }}
                  </td>
                  <td class="px-6 py-4 text-right font-mono text-primary font-bold">
                    {{ formatCurrency(item.total_revenue) }}
                  </td>
                  <td class="px-6 py-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                      <span class="text-xs font-bold"
                        >{{ getPercentage(item.total_revenue, totalRevenueOverall) }}%</span
                      >
                      <div class="w-16 h-1.5 bg-secondary/20 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-primary"
                          :style="{
                            width: `${getPercentage(item.total_revenue, totalRevenueOverall)}%`
                          }"
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== TAB: TREN HARIAN ====== -->
    <template v-else-if="activeTab === 'trend'">
      <div
        v-if="dailyTrendData.length === 0"
        class="bg-background border border-secondary rounded-xl p-12 text-center shadow-sm animate-fade-in"
      >
        <font-awesome-icon icon="fa-solid fa-chart-line" class="text-3xl text-text/20 mb-3" />
        <p class="text-text/50 text-sm">Tidak ada data tren untuk rentang waktu ini.</p>
      </div>
      <div v-else class="bg-background border border-secondary p-5 md:p-8 rounded-xl shadow-sm animate-fade-in">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h4 class="font-bold text-text text-lg mb-1">Tren Penjualan Harian</h4>
            <p class="text-xs text-text/50">Pergerakan data penjualan dari hari ke hari.</p>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold text-text/70">Tampilkan:</label>
            <select
              v-model="trendMetric"
              class="px-3 py-1.5 bg-background border border-secondary rounded-lg text-sm font-medium text-text focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              <option value="omset">Omset</option>
              <option value="qty">Qty Terjual</option>
              <option value="resi">Resi / Order</option>
            </select>
          </div>
        </div>
        <VueApexCharts
          v-if="!isThemeChanging"
          height="380"
          :type="trendSeries[0].type"
          :options="trendOptions"
          :series="trendSeries"
        />
      </div>
    </template>

    <!-- ====== TAB: PRODUK TERLARIS ====== -->
    <template v-else-if="activeTab === 'top-products'">
      <div
        v-if="topProductsData.length === 0"
        class="bg-background border border-secondary rounded-xl p-12 text-center shadow-sm animate-fade-in"
      >
        <font-awesome-icon icon="fa-solid fa-ranking-star" class="text-3xl text-text/20 mb-3" />
        <p class="text-text/50 text-sm">Tidak ada data produk terlaris untuk rentang waktu ini.</p>
      </div>
      <div v-else class="bg-background border border-secondary rounded-xl overflow-hidden shadow-sm animate-fade-in">
        <div class="p-4 border-b border-secondary/20 bg-secondary/5">
          <h4 class="font-bold text-text text-sm uppercase px-2">Top 10 Produk Terlaris (Semua Toko)</h4>
        </div>
        <div class="overflow-auto max-h-[500px] custom-scrollbar">
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead class="bg-background border-b border-secondary sticky top-0 z-10">
              <tr>
                <th class="px-6 py-4 font-semibold text-text/80" title="Peringkat penjualan">#</th>
                <th class="px-6 py-4 font-semibold text-text/80" title="Kode unik produk">SKU</th>
                <th class="px-6 py-4 font-semibold text-text/80" title="Nama produk">Produk</th>
                <th class="px-6 py-4 font-semibold text-text/80" title="Toko tempat produk terjual">Toko</th>
                <th class="px-6 py-4 font-semibold text-text/80 text-center" title="Platform penjualan">Saluran</th>
                <th class="px-6 py-4 font-semibold text-text/80 text-right" title="Jumlah produk yang terjual">
                  Qty Terjual
                </th>
                <th
                  class="px-6 py-4 font-semibold text-text/80 text-right"
                  title="Total pendapatan dari penjualan produk ini"
                >
                  Pendapatan
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20">
              <tr
                v-for="(item, index) in topProductsData"
                :key="`${item.sku}-${item.shopName}`"
                class="hover:bg-secondary/10 transition-colors"
              >
                <td class="px-6 py-4">
                  <span
                    class="w-6 h-6 inline-flex items-center justify-center rounded-full text-xs font-bold"
                    :class="index < 3 ? 'bg-primary/10 text-primary' : 'bg-secondary/20 text-text/50'"
                    >{{ index + 1 }}</span
                  >
                </td>
                <td class="px-6 py-4 font-mono text-xs text-text/70">{{ item.sku }}</td>
                <td class="px-6 py-4 font-medium text-text max-w-[200px] truncate" :title="item.productName">
                  {{ item.productName }}
                </td>
                <td class="px-6 py-4 text-text/70 text-xs">{{ item.shopName }}</td>
                <td class="px-6 py-4 text-center">
                  <span class="px-2 py-1 rounded-md text-xs font-bold" :class="sourceBadgeClass(item.source)">{{
                    item.source
                  }}</span>
                </td>
                <td class="px-6 py-4 text-right font-mono font-bold">
                  {{ formatNumber(item.totalSold) }}
                </td>
                <td class="px-6 py-4 text-right font-mono text-primary font-bold">
                  {{ formatCurrency(item.revenue) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- ====== TAB: KESEHATAN PEMENUHAN ====== -->
    <template v-else-if="activeTab === 'fulfillment'">
      <div
        v-if="fulfillmentData.length === 0"
        class="bg-background border border-secondary rounded-xl p-12 text-center shadow-sm animate-fade-in"
      >
        <font-awesome-icon icon="fa-solid fa-heart-pulse" class="text-3xl text-text/20 mb-3" />
        <p class="text-text/50 text-sm">Tidak ada data pemenuhan untuk rentang waktu ini.</p>
      </div>
      <div v-else class="space-y-4 animate-fade-in">
        <div
          v-for="item in fulfillmentData"
          :key="`${item.shopName}-${item.source}`"
          class="bg-background border border-secondary rounded-xl p-5 shadow-sm"
        >
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <h4 class="font-bold text-text">{{ item.shopName }}</h4>
              <span class="px-2 py-0.5 rounded-md text-xs font-bold" :class="sourceBadgeClass(item.source)">{{
                item.source
              }}</span>
            </div>
            <span class="text-xs text-text/50">{{ formatNumber(item.totalOrders) }} order total</span>
          </div>
          <!-- Rate Bars -->
          <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div class="p-3 bg-secondary/5 rounded-lg">
              <p class="text-[10px] uppercase font-bold text-text/40 mb-1">Selesai</p>
              <p class="text-lg font-bold text-success">{{ item.completionRate }}%</p>
              <div class="w-full h-1.5 bg-secondary/20 rounded-full mt-2 overflow-hidden">
                <div
                  class="h-full bg-success rounded-full transition-all"
                  :style="{ width: `${item.completionRate}%` }"
                ></div>
              </div>
              <p class="text-[10px] text-text/40 mt-1">{{ formatNumber(item.completedOrders) }} order</p>
            </div>
            <div class="p-3 bg-secondary/5 rounded-lg">
              <p class="text-[10px] uppercase font-bold text-text/40 mb-1">Dibatalkan</p>
              <p class="text-lg font-bold text-danger">{{ item.cancellationRate }}%</p>
              <div class="w-full h-1.5 bg-secondary/20 rounded-full mt-2 overflow-hidden">
                <div
                  class="h-full bg-danger rounded-full transition-all"
                  :style="{ width: `${item.cancellationRate}%` }"
                ></div>
              </div>
              <p class="text-[10px] text-text/40 mt-1">{{ formatNumber(item.cancelledOrders) }} order</p>
            </div>
            <div class="p-3 bg-secondary/5 rounded-lg">
              <p class="text-[10px] uppercase font-bold text-text/40 mb-1">Diretur</p>
              <p class="text-lg font-bold text-warning">{{ item.returnRate }}%</p>
              <div class="w-full h-1.5 bg-secondary/20 rounded-full mt-2 overflow-hidden">
                <div
                  class="h-full bg-warning rounded-full transition-all"
                  :style="{ width: `${item.returnRate}%` }"
                ></div>
              </div>
              <p class="text-[10px] text-text/40 mt-1">{{ formatNumber(item.returnedOrders) }} order</p>
            </div>
            <div class="p-3 bg-secondary/5 rounded-lg">
              <p class="text-[10px] uppercase font-bold text-text/40 mb-1">Pending</p>
              <p class="text-lg font-bold text-text/60">
                {{
                  item.totalOrders > 0
                    ? (100 - item.completionRate - item.cancellationRate - item.returnRate).toFixed(1)
                    : 0
                }}%
              </p>
              <div class="w-full h-1.5 bg-secondary/20 rounded-full mt-2 overflow-hidden">
                <div
                  class="h-full bg-text/30 rounded-full transition-all"
                  :style="{
                    width: `${item.totalOrders > 0 ? 100 - item.completionRate - item.cancellationRate - item.returnRate : 0}%`
                  }"
                ></div>
              </div>
              <p class="text-[10px] text-text/40 mt-1">{{ formatNumber(item.pendingOrders) }} order</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== TAB: PERBANDINGAN PERIODE ====== -->
    <template v-else-if="activeTab === 'comparison'">
      <div class="space-y-6 animate-fade-in">
        <!-- Period Labels -->
        <div class="flex items-center justify-center gap-4 text-sm">
          <span class="px-4 py-2 bg-primary/10 text-primary font-bold rounded-lg">{{ periodLabel.current }}</span>
          <font-awesome-icon icon="fa-solid fa-right-left" class="text-text/30" />
          <span class="px-4 py-2 bg-secondary/20 text-text/70 font-bold rounded-lg">{{ periodLabel.previous }}</span>
        </div>

        <!-- Delta Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            v-for="metric in compMetrics"
            :key="metric.label"
            class="bg-background border border-secondary rounded-xl p-5 shadow-sm"
          >
            <p class="text-xs font-semibold text-text/50 uppercase mb-2">{{ metric.label }}</p>
            <p class="text-2xl font-bold text-text">
              {{ metric.format === 'currency' ? formatCurrency(metric.current) : formatNumber(metric.current) }}
            </p>
            <div class="flex items-center gap-2 mt-2">
              <span
                class="text-xs font-bold px-2 py-0.5 rounded-full"
                :class="
                  metric.delta > 0
                    ? 'bg-success/10 text-success'
                    : metric.delta < 0
                      ? 'bg-danger/10 text-danger'
                      : 'bg-secondary/20 text-text/50'
                "
              >
                <font-awesome-icon
                  :icon="
                    metric.delta > 0
                      ? 'fa-solid fa-arrow-trend-up'
                      : metric.delta < 0
                        ? 'fa-solid fa-arrow-trend-down'
                        : 'fa-solid fa-minus'
                  "
                  class="mr-1"
                />
                {{ metric.delta > 0 ? '+' : '' }}{{ metric.delta }}%
              </span>
              <span class="text-[10px] text-text/40">vs {{ periodLabel.previous }}</span>
            </div>
            <p class="text-xs text-text/40 mt-1">
              Sebelumnya:
              {{ metric.format === 'currency' ? formatCurrency(metric.previous) : formatNumber(metric.previous) }}
            </p>
          </div>
        </div>

        <!-- Grouped Bar Chart -->
        <div class="bg-background border border-secondary p-5 md:p-8 rounded-xl shadow-sm">
          <h4 class="font-bold text-text text-lg mb-1">Grafik Perbandingan</h4>
          <p class="text-xs text-text/50 mb-6">{{ periodLabel.current }} vs {{ periodLabel.previous }}</p>
          <VueApexCharts
            v-if="!isThemeChanging"
            height="350"
            type="bar"
            :options="compBarOptions"
            :series="compBarSeries"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
