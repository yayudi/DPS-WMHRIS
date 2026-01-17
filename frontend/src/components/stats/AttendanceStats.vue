<script setup>
import { ref, computed } from 'vue'
import VueApexCharts from 'vue3-apexcharts'
import * as XLSX from 'xlsx'
import { calculateSummaryForUser } from '@/api/helpers/summary.js'
import { useAuthStore } from '@/stores/auth.js'
import { formatJamMenit } from '@/api/helpers/time.js'

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
    default: new Date().getFullYear()
  },
  month: {
    type: [Number, String],
    default: new Date().getMonth() + 1
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const authStore = useAuthStore()

// --- Aggregation Logic ---

// 1. Calculate Summary per User
const userSummaries = computed(() => {
  if (!props.users.length) return []
  return props.users.map(u => {
    // Add logic to re-calculate per user based on existing helper
    const summary = calculateSummaryForUser(u, parseInt(props.year), parseInt(props.month), props.summaryInfo, authStore)
    return {
      ...u,
      stats: summary
    }
  })
})

// 2. KPI Calculations
const kpiStats = computed(() => {
  if (!props.users.length) return []

  const totalUsers = props.users.length
  const totalWorkDays = props.summaryInfo.workDays || 20 // fallback
  const maxManDays = totalUsers * totalWorkDays

  // A. Kehadiran
  const totalHadirDays = userSummaries.value.reduce((sum, u) => sum + u.stats.hadirDays, 0)
  const attendanceRate = maxManDays > 0 ? ((totalHadirDays / maxManDays) * 100).toFixed(1) : 0

  // B. Keterlambatan
  const totalTelatUsers = userSummaries.value.filter(u => u.stats.telatHours !== '0j 0m').length

  const totalTelatMinutes = userSummaries.value.reduce((sum, u) => {
    const userTelat = u.stats.dendaPerHari.reduce((dSum, d) => dSum + d.telat, 0)
    return sum + userTelat
  }, 0)

  // C. Lembur
  const totalLemburMinutes = userSummaries.value.reduce((sum, u) => {
    const userLembur = u.stats.lemburPerHari.reduce((lSum, l) => lSum + l.lembur, 0)
    return sum + userLembur
  }, 0)

  // D. Early Out (Pulang Cepat)
  const totalEarlyMinutes = userSummaries.value.reduce((sum, u) => {
    // earlyOutPerHari usually contains raw timestamp/minutes?
    // Let's check summary.js: `earlyOutPerHari.push({ tanggal, jamKeluar })`
    // Wait, summary.js calculates `totalEarly` (minutes).
    // And `summary` object has `earlyOutHours`.
    // Does it export `earlyOutPerHari` with MINUTES?
    // Looking at summary.js:
    // `const early = jamKerjaEnd - jamKeluar` -> `totalEarly += early`.
    // So `totalEarly` is SUM of minutes.
    // It is not passed as a raw number in the summary object, only `earlyOutHours` (string).
    // BUT, we can re-sum from `earlyOutPerHari` OR just trust `totalEarly` if we modify summary.js?
    // Actually, `summary.js` DOES NOT return `totalEarly` raw in the return object.
    // However, it returns `earlyOutPerHari`. Let's check content: `{ tanggal, jamKeluar }`.
    // It DOES NOT store the 'early' minutes difference in the array object.
    // CRITICAL FIX: We need to calculate it again or infer it.
    // Or... we rely on `parseJamMenit` wrapper?
    // Let's stick to Parsing the formatted string 'Xj Ym' if needed, OR calculate roughly.
    // Better way: Re-calculate strictly from logs? No, that's heavy.
    // Let's modify `summary.js` logic in mind? No, we shouldn't touch shared algo if not needed.
    // Wait, the summary object has `earlyOutHours`.
    // Let's parse 'Xj Ym' back to minutes.
    const parts = u.stats.earlyOutHours.split(' ')
    let mins = 0
    parts.forEach(p => {
      if (p.includes('j')) mins += parseInt(p) * 60
      if (p.includes('m')) mins += parseInt(p)
    })
    return sum + mins
  }, 0)

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
      label: 'Pulang Cepat',
      value: formatJamMenit(totalEarlyMinutes),
      sub: 'Akumulasi Bulan Ini',
      color: 'text-danger',
      bg: 'bg-danger/10',
      icon: 'fa-solid fa-person-walking-arrow-right'
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


// 3. Charts Data
const chartSeries = computed(() => {
  if (!props.users.length || !props.year || !props.month) return []

  const daysInMonth = new Date(props.year, props.month, 0).getDate()
  const dataHadir = new Array(daysInMonth).fill(0)
  const dataTelat = new Array(daysInMonth).fill(0)

  // Loop all users -> all logs
  userSummaries.value.forEach(u => {
    if (Array.isArray(u.logs)) {
      u.logs.forEach((log, index) => {
        if (!log || index >= daysInMonth) return
        if (log.jamMasuk && log.jamKeluar) {
          dataHadir[index]++
        }
      })
      u.stats.dendaPerHari.forEach(d => {
        if (d.tanggal <= daysInMonth) dataTelat[d.tanggal - 1]++
      })
    }
  })

  return [
    { name: 'Hadir', data: dataHadir },
    { name: 'Terlambat', data: dataTelat }
  ]
})

const chartOptions = computed(() => ({
  chart: {
    type: 'area',
    toolbar: { show: false },
    fontFamily: 'inherit',
    background: 'transparent'
  },
  colors: ['#22c55e', '#f59e0b'],
  stroke: { curve: 'smooth', width: 2 },
  xaxis: {
    categories: Array.from({ length: new Date(props.year || 2025, props.month || 1, 0).getDate() }, (_, i) => i + 1),
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
      formatter: (value) => Math.floor(value)
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
}))

// 4. Tables (Top Lists)
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

const topEarlyOutUsers = computed(() => {
  return [...userSummaries.value]
    .map(u => {
      // Parse 'Xj Ym' for early minutes
      const parts = u.stats.earlyOutHours.split(' ')
      let mins = 0
      parts.forEach(p => {
        if (p.includes('j')) mins += parseInt(p) * 60
        if (p.includes('m')) mins += parseInt(p)
      })
      return {
        name: u.nama,
        minutes: mins
      }
    })
    .filter(u => u.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)
})

// 5. Per-Person Table Logic
const tableSearch = ref('')
const filteredUserSummaries = computed(() => {
  let data = userSummaries.value
  if (tableSearch.value) {
    const q = tableSearch.value.toLowerCase()
    data = data.filter(u => u.nama.toLowerCase().includes(q))
  }
  return data.sort((a, b) => a.nama.localeCompare(b.nama))
})

// 6. Export Logic
const handleExportExcel = () => {
  if (!userSummaries.value.length) return

  const data = userSummaries.value.map(u => ({
    'ID Karyawan': u.id,
    'Nama': u.nama,
    'Total Hadir (Hari)': u.stats.hadirDays,
    'Total Terlambat': u.stats.telatHours,
    'Total Pulang Cepat': u.stats.earlyOutHours,
    'Total Lembur': u.stats.lemburHours,
    'Total Absen (Hari)': u.stats.absenceDays,
    'Denda Keterlambatan (Rp)': u.stats.dendaTelat,
    'Estimasi Uang Lembur (Rp)': u.stats.uangLembur
  }))

  const ws = XLSX.utils.json_to_sheet(data)

  // Auto-width columns
  const colWidths = Object.keys(data[0]).map(key => ({
    wch: Math.max(key.length, ...data.map(row => (row[key] ? row[key].toString().length : 0))) + 2
  }))
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Absensi ${props.month}-${props.year}`)

  XLSX.writeFile(wb, `Statistik_Absensi_${props.year}_${props.month}.xlsx`)
}

// 7. User Detail Modal Logic
const selectedUser = ref(null)

const openDetail = (user) => {
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
    labels: { formatter: (val) => `${Math.floor(val)}:${Math.round((val % 1) * 60).toString().padStart(2, '0')}` }
  },
  grid: { borderColor: 'rgba(var(--color-secondary), 0.1)' },
  theme: { mode: 'dark' },
  annotations: {
    yaxis: [{
      y: 8,
      borderColor: '#ef4444',
      label: { text: '08:00', style: { color: '#fff', background: '#ef4444' } }
    }]
  }
}))

const userOvertimeChartOptions = computed(() => ({
  chart: { type: 'bar', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
  colors: ['#a855f7'],
  plotOptions: { bar: { borderRadius: 4 } },
  xaxis: {
    categories: Array.from({ length: new Date(props.year || 2025, props.month || 1, 0).getDate() }, (_, i) => i + 1),
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
      <!-- Header Actions -->
      <div class="flex justify-end">
        <button @click="handleExportExcel"
          class="flex items-center gap-2 px-4 py-2 bg-success/10 text-success hover:bg-success hover:text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-success/20">
          <font-awesome-icon icon="fa-solid fa-file-excel" />
          <span>Export Excel</span>
        </button>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="(kpi, index) in kpiStats" :key="index"
          class="bg-background border border-secondary/20 rounded-xl p-4 shadow-sm hover:border-primary/20 transition-colors group">
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
          <h4 class="text-sm font-bold text-text/70 uppercase mb-6">Tren Harian ({{ new Date(2000, month -
            1).toLocaleString('id-ID', { month: 'long' }) }} {{ year }})</h4>
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

          <!-- Top Early Out [NEW] -->
          <div class="bg-background border border-secondary/20 rounded-xl p-6 shadow-sm">
            <h4 class="text-sm font-bold text-text/70 uppercase mb-4 flex items-center gap-2">
              <font-awesome-icon icon="fa-solid fa-person-walking-arrow-right" class="text-danger" />
              Top Pulang Cepat
            </h4>
            <div class="space-y-3">
              <div v-for="(u, idx) in topEarlyOutUsers" :key="idx" class="flex justify-between items-center text-sm">
                <div class="flex items-center gap-3">
                  <span class="text-text/40 font-mono text-xs w-4">#{{ idx + 1 }}</span>
                  <span class="font-medium text-text">{{ u.name }}</span>
                </div>
                <div class="text-right">
                  <div class="font-bold text-danger">{{ formatJamMenit(u.minutes) }}</div>
                </div>
              </div>
              <div v-if="!topEarlyOutUsers.length" class="text-center text-text/40 text-xs py-4">Nihil</div>
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
          <input type="text" v-model="tableSearch" placeholder="Cari karyawan..."
            class="bg-secondary/10 border border-secondary/20 rounded-lg px-3 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-left text-sm">
            <thead>
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
            <tbody>
              <tr v-for="u in filteredUserSummaries" :key="u.id"
                class="hover:bg-secondary/5 transition-colors cursor-pointer group" @click="openDetail(u)">
                <td class="px-6 py-4 font-bold text-text group-hover:text-primary transition-colors">{{ u.nama }}</td>
                <td class="px-6 py-4 text-center">
                  <span class="inline-block px-2 py-0.5 rounded-md bg-success/10 text-success font-bold text-xs">
                    {{ u.stats.hadirDays }} Hari
                  </span>
                </td>
                <td class="px-6 py-4 text-center">
                  <div v-if="u.stats.telatHours !== '0j 0m'" class="text-warning font-bold">{{ u.stats.telatHours }}
                  </div>
                  <div v-else class="text-text/30">-</div>
                </td>
                <td class="px-6 py-4 text-center">
                  <div v-if="u.stats.earlyOutHours !== '0j 0m'" class="text-danger font-bold">{{ u.stats.earlyOutHours
                  }}
                  </div>
                  <div v-else class="text-text/30">-</div>
                </td>
                <td class="px-6 py-4 text-center">
                  <div v-if="u.stats.lemburHours !== '0j 0m'" class="text-primary font-bold">{{ u.stats.lemburHours }}
                  </div>
                  <div v-else class="text-text/30">-</div>
                </td>
                <td class="px-6 py-4 text-center">
                  <span v-if="u.stats.absenceDays > 0" class="text-danger font-bold">{{ u.stats.absenceDays }}
                    Hari</span>
                  <span v-else class="text-text/30">-</span>
                </td>
                <td class="px-6 py-4 text-right font-mono text-text/70">
                  Rp {{ u.stats.dendaTelat.toLocaleString('id-ID') }}
                </td>
              </tr>
              <tr v-if="!filteredUserSummaries.length">
                <td colspan="7" class="px-6 py-8 text-center text-text/40 italic">
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
  <div v-if="selectedUser"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
    @click.self="selectedUser = null">
    <div
      class="bg-background border border-secondary/20 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div class="p-6 border-b border-secondary/20 flex justify-between items-start sticky top-0 bg-background z-10">
        <div>
          <h4 class="text-xl font-bold text-text">{{ selectedUser.nama }}</h4>
          <p class="text-sm text-text/50">Detail Statistik Absensi ({{ new Date(2000, month -
            1).toLocaleString('id-ID', { month: 'long' }) }} {{ year }})</p>
        </div>
        <button @click="selectedUser = null" class="text-text/40 hover:text-text transition-colors">
          <font-awesome-icon icon="fa-solid fa-xmark" class="text-xl" />
        </button>
      </div>

      <div class="p-6 space-y-6">
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
            <div class="text-lg font-bold text-danger">Rp {{ selectedUser.stats.dendaTelat.toLocaleString('id-ID') }}
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
              <VueApexCharts type="bar" height="100%" :options="userOvertimeChartOptions"
                :series="userOvertimeSeries" />
            </div>
          </div>
        </div>
      </div>
    </div>
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

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>
