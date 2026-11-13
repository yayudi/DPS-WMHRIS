<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { dayjs } from '@/core/utils/time'
import { useTheme } from '@/core/presentation/composables/useTheme'
import { useI18n } from '@/core/presentation/composables/useI18n'
import DateRangeFilter from '@/core/presentation/components/ui/DateRangeFilter.vue'
import SearchInput from '@/core/presentation/components/ui/SearchInput.vue'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import { analyticsApi } from '@/modules/analytics/infrastructure/analytics.api'
import { serializeFilterParams } from '@/core/utils/filterParams'
import { useMasterDataStore } from '@/modules/master_data/application/masterData.store'

const { t } = useI18n()
const masterData = useMasterDataStore()
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))

const isDataLoading = ref(false)
const timelineList = ref<any[]>([])

const filterValues = ref({
  reportType: 'monthly',
  year: new Date().getFullYear(),
  selectedMonth: ('0' + (new Date().getMonth() + 1)).slice(-2),
  startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
  searchQuery: '',
  buildings: [] as string[]
})

const reportFilters = ref<{
  allBuildings: any[]
}>({
  allBuildings: []
})

const { themeColors, isDarkTheme, isThemeChanging } = useTheme()

onMounted(async () => {
  try {
    const res = await masterData.getReportFilters()
    if (res && res.allBuildings) {
      reportFilters.value.allBuildings = res.allBuildings
    }
  } catch (error) {
    console.error('Gagal memuat filter laporan lokasi', error)
  }
  fetchStatistics()
})

const activeResolution = ref('daily')

const reportTypeOptions = computed(() => [
  { id: 'monthly', label: t('analytics.time_perf.opt_monthly') },
  { id: 'annual', label: t('analytics.time_perf.opt_annual') },
  { id: 'custom', label: t('analytics.time_perf.opt_custom') }
])

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
  const years = []
  for (let i = current - 5; i <= current + 1; i++) {
    years.push(i)
  }
  return years
})

const getApiPayload = () => {
  let startDate, endDate, timeResolution
  if (filterValues.value.reportType === 'annual') {
    startDate = `${filterValues.value.year}-01-01`
    endDate = `${filterValues.value.year}-12-31`
    timeResolution = 'monthly'
  } else if (filterValues.value.reportType === 'monthly') {
    const d = new Date(`${filterValues.value.year}-${filterValues.value.selectedMonth}-02`)
    startDate = dayjs(d).startOf('month').format('YYYY-MM-DD')
    endDate = dayjs(d).endOf('month').format('YYYY-MM-DD')
    timeResolution = 'daily'
  } else {
    startDate = filterValues.value.startDate
    endDate = filterValues.value.endDate
    timeResolution = 'daily'
  }
  return {
    startDate,
    endDate,
    searchQuery: filterValues.value.searchQuery,
    buildings: filterValues.value.buildings,
    timeResolution
  }
}

const fetchStatistics = async () => {
  const payloadReq = getApiPayload()
  if (!payloadReq.startDate || !payloadReq.endDate) return

  isDataLoading.value = true
  activeResolution.value = payloadReq.timeResolution

  try {
    const response = await analyticsApi.getStockMovementStatistics(serializeFilterParams(payloadReq))
    const payload = response?.data || response

    if (payload && !Array.isArray(payload) && payload.timeline) {
      timelineList.value = payload.timeline || []
    } else {
      timelineList.value = []
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isDataLoading.value = false
  }
}

const applyFilters = () => {
  fetchStatistics()
}

const labelColor = computed(() => themeColors.value.text)

const chartTimelineSeries = computed(() => {
  return [
    { name: t('analytics.time_perf.series_in'), data: timelineList.value.map(t => t.total_in) },
    { name: t('analytics.time_perf.series_out'), data: timelineList.value.map(t => t.total_out * -1) }
  ]
})

const chartTimelineOptions = computed(() => ({
  chart: { type: 'bar', stacked: true, background: 'transparent', toolbar: { show: false } },
  colors: [themeColors.value.success, themeColors.value.danger],
  plotOptions: { bar: { borderRadius: 4, columnWidth: '40%' } },
  xaxis: {
    categories: timelineList.value.map(t => t.date),
    labels: {
      style: { colors: labelColor.value, cssClass: 'text-xs' },
      formatter: val => {
        if (!val) return val
        const parts = val.split('-')
        if (activeResolution.value === 'monthly') {
          // Format YYYY-MM
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
          const m = parseInt(parts[1], 10)
          return `${monthNames[m - 1]}`
        }
        return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : val
      }
    }
  },
  yaxis: {
    labels: {
      style: { colors: labelColor.value },
      formatter: val => Math.abs(Math.round(val))
    }
  },
  theme: { mode: isDarkTheme.value ? 'dark' : 'light' },
  dataLabels: { enabled: false },
  legend: { position: 'top', labels: { colors: labelColor.value } },
  tooltip: {
    theme: isDarkTheme.value ? 'dark' : 'light',
    y: {
      formatter: val => Math.abs(val) + ' Pcs'
    }
  }
}))

// Table sorting
const sortDesc = ref(true)

const displayedData = computed(() => {
  return [...timelineList.value].sort((a, b) => {
    if (a.date < b.date) return sortDesc.value ? 1 : -1
    if (a.date > b.date) return sortDesc.value ? -1 : 1
    return 0
  })
})

const toggleSort = () => {
  sortDesc.value = !sortDesc.value
}
</script>

<template>
  <div class="space-y-6">
    <div class="mb-6 border-b border-secondary/20 pb-4">
      <h3 class="text-lg font-bold text-text">{{ t('analytics.time_perf.title') }}</h3>
      <p class="text-sm text-text/50 mt-1">
        {{ t('analytics.time_perf.subtitle') }}
      </p>
    </div>

    <!-- Filter Controls -->
    <div class="bg-background border border-secondary p-4 rounded-xl flex flex-col gap-4 shadow-sm">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <!-- Tipe Laporan -->
        <div>
          <label class="block text-xs font-semibold text-text/60 mb-2">{{
            t('analytics.time_perf.report_type')
          }}</label>
          <BaseSelect v-model="filterValues.reportType" :options="reportTypeOptions" emitValue :searchable="false" />
        </div>

        <!-- Rentang Tanggal / Bulan / Tahun -->
        <div>
          <label class="block text-xs font-semibold text-text/60 mb-2">{{
            t('analytics.time_perf.specific_time')
          }}</label>

          <div v-if="filterValues.reportType === 'annual'">
            <BaseSelect v-model="filterValues.year" :options="availableYears" emitValue :searchable="false" />
          </div>

          <div v-else-if="filterValues.reportType === 'monthly'" class="flex gap-2">
            <BaseSelect
              v-model="filterValues.selectedMonth"
              :options="availableMonths"
              track-by="value"
              emitValue
              :searchable="false"
              class="w-1/2"
            />
            <BaseSelect
              v-model="filterValues.year"
              :options="availableYears"
              emitValue
              :searchable="false"
              class="w-1/2"
            />
          </div>

          <div v-else>
            <DateRangeFilter
              v-model:startDate="filterValues.startDate"
              v-model:endDate="filterValues.endDate"
              align="left"
            />
          </div>
        </div>

        <!-- Filter Nama / SKU -->
        <div>
          <label class="block text-xs font-semibold text-text/60 mb-2">{{
            t('analytics.time_perf.search_label')
          }}</label>
          <SearchInput v-model="filterValues.searchQuery" :placeholder="t('common.placeholder.search_sku')" />
        </div>
      </div>

      <!-- Advanced Filters Row -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-secondary/20 pt-4">
        <!-- Gedung -->
        <div>
          <label class="block text-xs font-semibold text-text/60 mb-2">{{
            t('analytics.time_perf.building_label')
          }}</label>
          <BaseSelect
            v-model="filterValues.buildings"
            :options="reportFilters.allBuildings"
            :multiple="true"
            :placeholder="t('common.filter.all_buildings')"
          />
        </div>

        <div class="flex items-start pt-6">
          <button
            @click="applyFilters"
            :disabled="isDataLoading"
            class="h-[42px] w-full px-8 bg-primary text-secondary font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex justify-center items-center text-sm"
          >
            <font-awesome-icon v-if="isDataLoading" icon="fa-solid fa-spinner" spin class="mr-2" />
            {{ t('analytics.time_perf.btn_apply') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Main Chart Section -->
    <main
      v-if="isDataLoading"
      class="bg-background border border-secondary rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
    >
      <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-4xl mb-4 text-primary" />
      <p class="font-medium text-text/60">{{ t('analytics.time_perf.loading') }}</p>
    </main>

    <template v-else-if="timelineList.length > 0">
      <div class="bg-background border border-secondary p-5 md:p-8 rounded-xl shadow-sm animate-fade-in w-full">
        <h4 class="font-bold text-text text-lg mb-2">{{ t('analytics.time_perf.chart_title') }}</h4>
        <p class="text-xs md:text-sm text-text/50 mb-6">
          {{ t('analytics.time_perf.chart_desc') }}
        </p>

        <div class="w-full block">
          <VueApexCharts
            v-if="!isThemeChanging"
            width="100%"
            height="450"
            type="bar"
            :options="chartTimelineOptions"
            :series="chartTimelineSeries"
          />
        </div>
      </div>

      <!-- Data Table -->
      <div class="bg-background border border-secondary rounded-xl overflow-hidden shadow-sm animate-fade-in mt-6">
        <div class="p-4 border-b border-secondary/20 flex justify-between items-center bg-secondary/5">
          <h4 class="font-bold text-text text-sm uppercase px-2">{{ t('analytics.time_perf.table_title') }}</h4>
        </div>
        <div class="overflow-auto max-h-[500px]">
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead class="bg-background border-b border-secondary sticky top-0 z-10">
              <tr>
                <th
                  @click="toggleSort"
                  class="px-6 py-4 font-semibold text-text/80 cursor-pointer hover:bg-secondary/40 w-[200px]"
                  :title="t('analytics.time_perf.col_period_title')"
                >
                  <div class="flex items-center gap-2">
                    {{ t('analytics.time_perf.col_period') }}
                    <font-awesome-icon
                      :icon="sortDesc ? 'fa-solid fa-sort-down' : 'fa-solid fa-sort-up'"
                      class="text-xs opacity-50"
                    />
                  </div>
                </th>
                <th
                  class="px-6 py-4 font-semibold text-text/80 text-center"
                  :title="t('analytics.time_perf.col_inbound_title')"
                >
                  {{ t('analytics.time_perf.col_inbound') }}
                </th>
                <th
                  class="px-6 py-4 font-semibold text-text/80 text-center"
                  :title="t('analytics.time_perf.col_outbound_title')"
                >
                  {{ t('analytics.time_perf.col_outbound') }}
                </th>
                <th
                  class="px-6 py-4 font-semibold text-text/80 text-right"
                  :title="t('analytics.time_perf.col_net_title')"
                >
                  {{ t('analytics.time_perf.col_net') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20">
              <tr v-for="item in displayedData" :key="item.date" class="hover:bg-secondary/10 transition-colors">
                <td class="px-6 py-3 font-medium text-text font-mono border-r border-secondary/10">
                  {{
                    filterValues.reportType === 'annual' && item.date.length >= 7
                      ? ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][
                          parseInt(item.date.split('-')[1]) - 1
                        ] +
                        ' ' +
                        filterValues.year
                      : item.date
                  }}
                </td>
                <td class="px-6 py-3 text-success font-medium text-center bg-success/5">
                  <span v-if="item.total_in > 0">+ {{ item.total_in }}</span>
                  <span v-else class="text-text/30">-</span>
                </td>
                <td class="px-6 py-3 text-danger font-medium text-center bg-danger/5">
                  <span v-if="item.total_out > 0">{{ item.total_out }}</span>
                  <span v-else class="text-text/30">-</span>
                </td>
                <td
                  class="px-6 py-3 text-right font-bold"
                  :class="
                    item.total_in - item.total_out > 0
                      ? 'text-success'
                      : item.total_in - item.total_out < 0
                        ? 'text-danger'
                        : 'text-text/50'
                  "
                >
                  {{ item.total_in - item.total_out > 0 ? '+' : '' }}{{ item.total_in - item.total_out }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <main
      v-else
      class="bg-background border border-secondary rounded-xl p-16 flex flex-col items-center justify-center text-center shadow-sm"
    >
      <font-awesome-icon icon="fa-solid fa-calendar-xmark" class="text-4xl mb-4 text-text/30" />
      <h4 class="font-bold text-text text-lg">{{ t('analytics.time_perf.empty_title') }}</h4>
      <p class="text-text/60 mt-2 text-sm max-w-sm">
        {{ t('analytics.time_perf.empty_desc') }}
      </p>
    </main>
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
