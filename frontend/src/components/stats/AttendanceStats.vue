<script setup>
import { ref, computed, defineAsyncComponent } from 'vue'
const VueApexCharts = defineAsyncComponent(() => import('vue3-apexcharts'))
import { calculateSummaryForUser } from '@/api/helpers/summary'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { formatJamMenit } from '@/api/helpers/time'
import BaseModal from '@/components/ui/BaseModal.vue'

const props = defineProps({
  users: {
    type: Array,
    default: () => []
  },
  summaryInfo: {
    type: Object,
    default: () => ({})
  },
  year: {
    type: [Number, String],
    default: null
  },
  month: {
    type: [Number, String],
    default: null
  },
  startDate: {
    type: String,
    default: null
  },
  endDate: {
    type: String,
    default: null
  },
  loading: {
    type: Boolean,
    default: false
  },
  mobileLayout: {
    type: String,
    default: 'card'
  }
})

const authStore = useAuthStore()

// --- Aggregation Logic ---

// Calculate Summary per User
const userSummaries = computed(() => {
  if (!props.users.length) return []
  return props.users.map(u => {
    // Add logic to re-calculate per user based on existing helper
    // Note: year/month passed might be null in Range Mode, but summary helper now handles fullDate
    const summary = calculateSummaryForUser(
      u,
      parseInt(props.year),
      parseInt(props.month),
      props.summaryInfo,
      authStore
    )
    return {
      ...u,
      stats: summary
    }
  })
})

// KPI Calculations
const kpiStats = computed(() => {
  if (!props.users.length) return []

  const totalUsers = props.users.length
  // Support Range Workdays from globalInfo if available
  const totalWorkDays = props.summaryInfo.workDays || 20
  const maxManDays = totalUsers * totalWorkDays

  // A. Kehadiran
  const totalHadirDays = userSummaries.value.reduce((sum, u) => sum + u.stats.hadirDays, 0)
  const attendanceRate = maxManDays > 0 ? ((totalHadirDays / maxManDays) * 100).toFixed(1) : 0

  // B. Keterlambatan
  const totalTelatUsers = userSummaries.value.filter(u => u.stats.telatHours !== '0j 0m').length

  const totalTelatMinutes = userSummaries.value.reduce((sum, u) => {
    // Check if dendaPerHari is robust? Better use aggregated 'lateness' from logs?
    // Using pre-calculated 'telatHours' (string) -> minute conversion is risky if helper changed.
    // Use helper sum:
    const userTelat = u.stats.dendaPerHari.reduce((dSum, d) => dSum + d.telat, 0)
    return sum + userTelat
  }, 0)

  // C. Lembur
  const totalLemburMinutes = userSummaries.value.reduce((sum, u) => {
    const userLembur = u.stats.lemburPerHari.reduce((lSum, l) => lSum + l.lembur, 0)
    return sum + userLembur
  }, 0)

  // D. Absen
  const totalAbsenceDays = userSummaries.value.reduce((sum, u) => sum + u.stats.absenceDays, 0)

  return [
    {
      label: 'Rate Kehadiran',
      value: `${attendanceRate}%`,
      sub: `${totalHadirDays} / ${maxManDays} Man-Days`,
      color: 'text-success',
      bg: 'bg-success/10',
      icon: 'fa-solid fa-users-viewfinder'
    },
    {
      label: 'Keterlambatan',
      value: formatJamMenit(totalTelatMinutes),
      sub: `${totalTelatUsers} User Terlambat`,
      color: 'text-warning',
      bg: 'bg-warning/10',
      icon: 'fa-solid fa-user-clock'
    },
    {
      label: 'Total Absen',
      value: `${totalAbsenceDays} Hari`,
      sub: 'Akumulasi Bulan Ini',
      color: 'text-danger',
      bg: 'bg-danger/10',
      icon: 'fa-solid fa-user-xmark'
    },
    {
      label: 'Total Lembur',
      value: formatJamMenit(totalLemburMinutes),
      sub: 'Akumulasi Bulan Ini',
      color: 'text-primary',
      bg: 'bg-primary/10',
      icon: 'fa-solid fa-briefcase'
    }
  ]
})

// Charts Data
const chartDataPoints = computed(() => {
  if (!props.users.length) return { length: 0, hadir: [], telat: [] }

  // Use the length of logs from the first user (normalized logs should be same length for all)
  const sampleLogs = props.users[0].logs || []
  const validLength = sampleLogs.length

  const dataHadir = new Array(validLength).fill(0)
  const dataTelat = new Array(validLength).fill(0)

  userSummaries.value.forEach(u => {
    if (Array.isArray(u.logs)) {
      u.logs.forEach((log, index) => {
        if (!log || index >= validLength) return

        // Count Present
        if (log.jamMasuk && log.jamKeluar) {
          dataHadir[index]++
        }

        // Count Late (Using direct log property is safer than dendaPerHari index for Range)
        if (log.lateness > 0) {
          dataTelat[index]++
        }
      })
    }
  })

  return { length: validLength, hadir: dataHadir, telat: dataTelat }
})

const chartSeries = computed(() => {
  const { hadir, telat } = chartDataPoints.value
  return [
    { name: 'Hadir', data: hadir },
    { name: 'Terlambat', data: telat }
  ]
})

const chartOptions = computed(() => {
  // Generate categories (Labels)
  let categories = []
  if (props.startDate && props.endDate) {
    const s = new Date(props.startDate)
    const e = new Date(props.endDate)
    const days = []
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d))
    }
    categories = days.map(d => d.getDate().toString())
    if (days.length <= 31) categories = days.map(d => d.getDate())
    else categories = days.map(d => `${d.getDate()} ${d.toLocaleString('id-ID', { month: 'short' })}`)
  } else if (props.year && props.month) {
    const daysInMonth = new Date(props.year, props.month, 0).getDate()
    categories = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  }

  return {
    chart: {
      type: 'area',
      toolbar: { show: false },
      fontFamily: 'inherit',
      background: 'transparent'
    },
    colors: ['#22c55e', '#f59e0b'],
    stroke: { curve: 'smooth', width: 2 },
    xaxis: {
      categories: categories,
      tooltip: { enabled: false },
      labels: {
        show: true,
        style: { colors: '#6b7280', fontSize: '11px', fontFamily: 'inherit' }
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      show: true,
      labels: {
        show: true,
        style: { colors: '#6b7280', fontSize: '11px', fontFamily: 'inherit' },
        formatter: value => Math.floor(value)
      }
    },
    theme: { mode: 'dark' },
    grid: {
      show: true,
      borderColor: 'rgba(var(--color-secondary), 0.1)',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } }
    },
    dataLabels: { enabled: false }
  }
})

// Tables (Top Lists)
const topLateUsers = computed(() => {
  return [...userSummaries.value]
    .map(u => ({
      name: u.nama,
      minutes: u.stats.dendaPerHari.reduce((acc, curr) => acc + curr.telat, 0),
      count: u.stats.dendaPerHari.length
    }))
    .filter(u => u.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)
})

const topOvertimeUsers = computed(() => {
  return [...userSummaries.value]
    .map(u => ({
      name: u.nama,
      minutes: u.stats.lemburPerHari.reduce((acc, curr) => acc + curr.lembur, 0)
    }))
    .filter(u => u.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)
})

const topAbsentUsers = computed(() => {
  return [...userSummaries.value]
    .map(u => ({
      name: u.nama,
      days: u.stats.absenceDays
    }))
    .filter(u => u.days > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5)
})

// Per-Person Table Logic
const tableSearch = ref('')
const filteredUserSummaries = computed(() => {
  let data = userSummaries.value
  if (tableSearch.value) {
    const q = tableSearch.value.toLowerCase()
    data = data.filter(u => u.nama.toLowerCase().includes(q))
  }
  return data.sort((a, b) => a.nama.localeCompare(b.nama))
})

// User Detail Modal Logic
const selectedUser = ref(null)

const openDetail = user => {
  selectedUser.value = user
}

const userArrivalSeries = computed(() => {
  if (!selectedUser.value || !props.year || !props.month) return []

  const daysInMonth = new Date(props.year, props.month, 0).getDate()
  const dataPoints = new Array(daysInMonth).fill(null)

  if (Array.isArray(selectedUser.value.logs)) {
    selectedUser.value.logs.forEach((log, index) => {
      if (!log || index >= daysInMonth) return
      if (log.jamMasuk) {
        const hours = log.jamMasuk / 60
        dataPoints[index] = parseFloat(hours.toFixed(2))
      }
    })
  }

  return [{ name: 'Jam Masuk', data: dataPoints }]
})

const userOvertimeSeries = computed(() => {
  if (!selectedUser.value || !props.year || !props.month) return []

  const daysInMonth = new Date(props.year, props.month, 0).getDate()
  const dataPoints = new Array(daysInMonth).fill(0)

  if (Array.isArray(selectedUser.value.stats.lemburPerHari)) {
    selectedUser.value.stats.lemburPerHari.forEach(l => {
      if (l.tanggal <= daysInMonth) {
        dataPoints[l.tanggal - 1] = l.lembur
      }
    })
  }
  return [{ name: 'Lembur (Menit)', data: dataPoints }]
})

const userDetailChartOptions = computed(() => ({
  chart: { type: 'line', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
  colors: ['#3b82f6'],
  stroke: { curve: 'straight', width: 2 },
  markers: { size: 4 },
  xaxis: {
    categories: Array.from({ length: new Date(props.year || 2025, props.month || 1, 0).getDate() }, (_, i) => i + 1),
    tooltip: { enabled: false }
  },
  yaxis: {
    min: 6,
    max: 12,
    labels: {
      formatter: val =>
        `${Math.floor(val)}:${Math.round((val % 1) * 60)
          .toString()
          .padStart(2, '0')}`
    }
  },
  grid: { borderColor: 'rgba(var(--color-secondary), 0.1)' },
  theme: { mode: 'dark' },
  annotations: {
    yaxis: [
      {
        y: 8,
        borderColor: '#ef4444',
        label: { text: '08:00', style: { color: '#fff', background: '#ef4444' } }
      }
    ]
  }
}))

const userOvertimeChartOptions = computed(() => ({
  chart: { type: 'bar', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
  colors: ['#a855f7'],
  plotOptions: { bar: { borderRadius: 4 } },
  xaxis: {
    categories: Array.from({ length: new Date(props.year || 2025, props.month || 1, 0).getDate() }, (_, i) => i + 1)
  },
  theme: { mode: 'dark' },
  grid: { borderColor: 'rgba(var(--color-secondary), 0.1)' }
}))
</script>

<template>
  <div class="animate-fade-in space-y-6">
    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-20">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>

    <template v-else>
      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="(kpi, index) in kpiStats"
          :key="index"
          class="bg-background border border-secondary/20 rounded-xl p-4 shadow-sm hover:border-primary/20 transition-colors group"
        >
          <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-bold text-text/50 uppercase">{{ kpi.label }}</span>
            <div :class="`w-8 h-8 rounded-full ${kpi.bg} flex items-center justify-center ${kpi.color}`">
              <font-awesome-icon :icon="kpi.icon" />
            </div>
          </div>
          <div class="flex flex-col">
            <span class="text-2xl font-bold text-text">{{ kpi.value }}</span>
            <span class="text-xs text-text/40">{{ kpi.sub }}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Chart -->
        <div class="lg:col-span-2 bg-background border border-secondary/20 rounded-xl p-6 shadow-sm">
          <h4 class="text-sm font-bold text-text/70 uppercase mb-6">
            Tren Harian ({{ new Date(2000, month - 1).toLocaleString('id-ID', { month: 'long' }) }} {{ year }})
          </h4>
          <div class="h-[300px] w-full">
            <VueApexCharts type="area" height="100%" :options="chartOptions" :series="chartSeries" />
          </div>
        </div>

        <!-- Top Lists -->
        <div class="space-y-6">
          <!-- Top Late -->
          <div class="bg-background border border-secondary/20 rounded-xl p-6 shadow-sm">
            <h4 class="text-sm font-bold text-text/70 uppercase mb-4 flex items-center gap-2">
              <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-warning" />
              Top Terlambat
            </h4>
            <div class="space-y-3">
              <div v-for="(u, idx) in topLateUsers" :key="idx" class="flex justify-between items-center text-sm">
                <div class="flex items-center gap-3">
                  <span class="text-text/40 font-mono text-xs w-4">#{{ idx + 1 }}</span>
                  <span class="font-medium text-text">{{ u.name }}</span>
                </div>
                <div class="text-right">
                  <div class="font-bold text-warning">{{ formatJamMenit(u.minutes) }}</div>
                  <div class="text-[10px] text-text/40">{{ u.count }}x</div>
                </div>
              </div>
              <div v-if="!topLateUsers.length" class="text-center text-text/40 text-xs py-4">Nihil</div>
            </div>
          </div>

          <!-- Top Absen -->
          <div class="bg-background border border-secondary/20 rounded-xl p-6 shadow-sm">
            <h4 class="text-sm font-bold text-text/70 uppercase mb-4 flex items-center gap-2">
              <font-awesome-icon icon="fa-solid fa-user-xmark" class="text-danger" />
              Top Absen
            </h4>
            <div class="space-y-3">
              <div v-for="(u, idx) in topAbsentUsers" :key="idx" class="flex justify-between items-center text-sm">
                <div class="flex items-center gap-3">
                  <span class="text-text/40 font-mono text-xs w-4">#{{ idx + 1 }}</span>
                  <span class="font-medium text-text">{{ u.name }}</span>
                </div>
                <div class="text-right">
                  <div class="font-bold text-danger">{{ u.days }} Hari</div>
                </div>
              </div>
              <div v-if="!topAbsentUsers.length" class="text-center text-text/40 text-xs py-4">Nihil</div>
            </div>
          </div>

          <!-- Top Overtime -->
          <div class="bg-background border border-secondary/20 rounded-xl p-6 shadow-sm">
            <h4 class="text-sm font-bold text-text/70 uppercase mb-4 flex items-center gap-2">
              <font-awesome-icon icon="fa-solid fa-moon" class="text-primary" />
              Top Lembur
            </h4>
            <div class="space-y-3">
              <div v-for="(u, idx) in topOvertimeUsers" :key="idx" class="flex justify-between items-center text-sm">
                <div class="flex items-center gap-3">
                  <span class="text-text/40 font-mono text-xs w-4">#{{ idx + 1 }}</span>
                  <span class="font-medium text-text">{{ u.name }}</span>
                </div>
                <div class="font-bold text-primary">{{ formatJamMenit(u.minutes) }}</div>
              </div>
              <div v-if="!topOvertimeUsers.length" class="text-center text-text/40 text-xs py-4">Nihil</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Per-Person Table -->
      <div class="bg-background border border-secondary/20 rounded-xl p-6 shadow-sm">
        <div class="flex justify-between items-center mb-4">
          <h4 class="text-sm font-bold text-text/70 uppercase">Statistik Per Karyawan</h4>
          <input
            type="text"
            v-model="tableSearch"
            placeholder="Cari karyawan..."
            class="bg-secondary/80 border border-secondary/20 rounded-lg px-3 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-sm border-collapse block md:table">
            <thead class="hidden md:table-header-group">
              <tr class="text-text/50 uppercase text-xs border-b border-secondary/20">
                <th class="px-6 py-3">Nama</th>
                <th class="px-6 py-3 text-center">Hadir</th>
                <th class="px-6 py-3 text-center">Telat</th>
                <th class="px-6 py-3 text-center">Cepat</th>
                <th class="px-6 py-3 text-center">Lembur</th>
                <th class="px-6 py-3 text-center">Absen</th>
                <th class="px-6 py-3 text-right">Denda</th>
              </tr>
            </thead>
            <tbody class="block md:table-row-group">
              <tr
                v-for="u in filteredUserSummaries"
                :key="u.id"
                class="block md:table-row hover:bg-secondary/5 transition-colors cursor-pointer group mb-4 md:mb-0 bg-background/50 md:bg-transparent rounded-xl md:rounded-none shadow-sm md:shadow-none p-4 md:p-0 border border-secondary/20 md:border-none md:border-b md:border-secondary/20"
                :class="{ 'mx-0': mobileLayout === 'card' }"
                @click="openDetail(u)"
              >
                <td
                  class="flex justify-between items-center md:table-cell px-2 md:px-6 py-2 md:py-4 font-bold text-text group-hover:text-primary transition-colors border-b border-secondary/10 md:border-none mb-2 md:mb-0"
                >
                  <span class="text-base md:text-sm">{{ u.nama }}</span>
                  <span class="md:hidden text-xs font-normal text-text/60 bg-secondary/10 px-2 py-1 rounded"
                    >Detail ></span
                  >
                </td>

                <td class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center">
                  <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Hadir</span>
                  <span class="inline-block px-2 py-0.5 rounded-md bg-success/10 text-success font-bold text-xs">
                    {{ u.stats.hadirDays }} Hari
                  </span>
                </td>

                <td class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center">
                  <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Telat</span>
                  <div v-if="u.stats.telatHours !== '0j 0m'" class="text-warning font-bold">
                    {{ u.stats.telatHours }}
                  </div>
                  <div v-else class="text-text/30">
                    <span class="md:block hidden">-</span>
                    <span class="md:hidden">0j 0m</span>
                  </div>
                </td>

                <td
                  v-if="mobileLayout !== 'compact'"
                  class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center"
                >
                  <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Cepat</span>
                  <div v-if="u.stats.earlyOutHours !== '0j 0m'" class="text-danger font-bold">
                    {{ u.stats.earlyOutHours }}
                  </div>
                  <div v-else class="text-text/30">
                    <span class="md:block hidden">-</span>
                    <span class="md:hidden">0j 0m</span>
                  </div>
                </td>

                <td class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center">
                  <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Lembur</span>
                  <div v-if="u.stats.lemburHours !== '0j 0m'" class="text-primary font-bold">
                    {{ u.stats.lemburHours }}
                  </div>
                  <div v-else class="text-text/30">
                    <span class="md:block hidden">-</span>
                    <span class="md:hidden">0j 0m</span>
                  </div>
                </td>

                <td class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-center">
                  <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Absen</span>
                  <span v-if="u.stats.absenceDays > 0" class="text-danger font-bold"
                    >{{ u.stats.absenceDays }} Hari</span
                  >
                  <span v-else class="text-text/30">
                    <span class="md:block hidden">-</span>
                    <span class="md:hidden">0 Hari</span>
                  </span>
                </td>

                <td
                  v-if="mobileLayout !== 'compact'"
                  class="flex justify-between items-center md:table-cell px-2 md:px-6 py-1 md:py-4 text-right font-mono text-text/70 border-t border-secondary/10 md:border-none mt-2 md:mt-0 pt-2 md:pt-4"
                >
                  <span class="md:hidden text-text/60 text-xs uppercase font-semibold">Denda</span>
                  <span>Rp {{ u.stats.dendaTelat.toLocaleString('id-ID') }}</span>
                </td>
              </tr>
              <tr v-if="!filteredUserSummaries.length" class="block md:table-row">
                <td colspan="7" class="px-6 py-8 text-center text-text/40 italic block md:table-cell">
                  Tidak ada data karyawan yang cocok.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>

  <!-- User Detail Modal -->
  <Teleport to="body">
    <BaseModal :show="!!selectedUser" @close="selectedUser = null" maxWidth="max-w-4xl">
      <template #title>
        <div class="-mt-1">
          <h4 class="text-xl font-bold text-text">{{ selectedUser?.nama }}</h4>
          <p class="text-sm text-text/50 font-normal mt-1">
            Detail Statistik Absensi ({{ new Date(2000, month - 1).toLocaleString('id-ID', { month: 'long' }) }}
            {{ year }})
          </p>
        </div>
      </template>

      <div v-if="selectedUser" class="space-y-6">
        <!-- Summary Cards Small -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-secondary/5 rounded-lg p-3 border border-secondary/10">
            <div class="text-xs text-text/50 uppercase font-bold">Total Hadir</div>
            <div class="text-lg font-bold text-success">{{ selectedUser.stats.hadirDays }} Hari</div>
          </div>
          <div class="bg-secondary/5 rounded-lg p-3 border border-secondary/10">
            <div class="text-xs text-text/50 uppercase font-bold">Total Telat</div>
            <div class="text-lg font-bold text-warning">{{ selectedUser.stats.telatHours }}</div>
          </div>
          <div class="bg-secondary/5 rounded-lg p-3 border border-secondary/10">
            <div class="text-xs text-text/50 uppercase font-bold">Total Lembur</div>
            <div class="text-lg font-bold text-primary">{{ selectedUser.stats.lemburHours }}</div>
          </div>
          <div class="bg-secondary/5 rounded-lg p-3 border border-secondary/10">
            <div class="text-xs text-text/50 uppercase font-bold">Estimasi Denda</div>
            <div class="text-lg font-bold text-danger">
              Rp {{ selectedUser.stats.dendaTelat.toLocaleString('id-ID') }}
            </div>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Arrival Time Chart -->
          <div class="bg-secondary/5 rounded-xl p-4 border border-secondary/10">
            <h5 class="text-sm font-bold text-text/70 mb-4">Waktu Kedatangan</h5>
            <div class="h-[250px]">
              <VueApexCharts type="line" height="100%" :options="userDetailChartOptions" :series="userArrivalSeries" />
            </div>
          </div>
          <!-- Overtime Duration Chart -->
          <div class="bg-secondary/5 rounded-xl p-4 border border-secondary/10">
            <h5 class="text-sm font-bold text-text/70 mb-4">Durasi Lembur (Menit)</h5>
            <div class="h-[250px]">
              <VueApexCharts
                type="bar"
                height="100%"
                :options="userOvertimeChartOptions"
                :series="userOvertimeSeries"
              />
            </div>
          </div>
        </div>
      </div>
    </BaseModal>
  </Teleport>
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
