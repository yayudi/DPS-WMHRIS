<!-- frontend\src\views\Stats.vue -->
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import {
  fetchKpiSummary,
  requestExportStock,
  getUserExportJobs,
  fetchReportFilters,
} from '@/api/helpers/stats.js'
import { useToast } from '@/composables/useToast.js'
import SearchInput from '@/components/ui/SearchInput.vue'
import FilterContainer from '@/components/ui/FilterContainer.vue'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'

const { show: showToast } = useToast()
const isSidebarOpen = ref(false)

// State untuk data KPI
const kpiData = ref(null)
const isLoading = ref(true)
const errorMessage = ref(null)
const isRequesting = ref(false)
const jobHistory = ref([])
const isHistoryLoading = ref(false)

// State untuk filter
const selectedFilters = ref({
  searchQuery: '',
  building: [],
  purpose: '',
  isPackage: '',
  stockStatus: 'positive',
})
const reportFilters = ref({
  allBuildings: [],
  purposes: [],
  buildingsByPurpose: {},
})

// State untuk navigasi laporan
const activeReport = ref('overview')

// Menu navigasi untuk sidebar (dengan ikon)
const reportsMenu = [
  { key: 'overview', label: 'Overview', group: 'Overview', icon: 'fa-solid fa-chart-pie' },
  {
    key: 'sales',
    label: 'Laporan Penjualan',
    group: 'Laporan Utama',
    icon: 'fa-solid fa-chart-line',
  },
  {
    key: 'dead-stock',
    label: 'Laporan Stok Mati',
    group: 'Laporan Utama',
    icon: 'fa-solid fa-skull',
  },
  {
    key: 'inventory-value',
    label: 'Laporan Nilai Inventaris',
    group: 'Laporan Utama',
    icon: 'fa-solid fa-dollar-sign',
  },
  {
    key: 'channel-performance',
    label: 'Laporan Performa Saluran',
    group: 'Laporan Utama',
    icon: 'fa-solid fa-store',
  },
  { key: 'sku-audit', label: 'Audit SKU', group: 'Audit & Lainnya', icon: 'fa-solid fa-search' },
  {
    key: 'export-stock',
    label: 'Ekspor Laporan Stok',
    group: 'Audit & Lainnya',
    icon: 'fa-solid fa-file-excel',
  },
]

async function loadKpiData() {
  isLoading.value = true
  errorMessage.value = null
  try {
    const data = await fetchKpiSummary()
    kpiData.value = data
  } catch (error) {
    errorMessage.value = error.message || 'Gagal terhubung ke server.'
    showToast(errorMessage.value, 'error')
  } finally {
    isLoading.value = false
  }
}

async function loadReportFilters() {
  try {
    const response = await fetchReportFilters()
    if (response) {
      reportFilters.value.allBuildings = response.allBuildings || []
      reportFilters.value.purposes = response.purposes || []
      reportFilters.value.buildingsByPurpose = response.buildingsByPurpose || {}
    }
  } catch (error) {
    console.error('Gagal memuat filter:', error)
  }
}

async function loadHistory() {
  isHistoryLoading.value = true
  try {
    const response = await getUserExportJobs()
    if (response.success) {
      jobHistory.value = response.data
    }
  } catch (error) {
    console.error('Gagal memuat riwayat:', error)
    showToast('Gagal memuat riwayat laporan', 'error')
  } finally {
    isHistoryLoading.value = false
  }
}

// Muat data KPI saat komponen pertama kali dimuat
onMounted(() => {
  if (activeReport.value === 'overview') {
    loadKpiData()
  }
  loadReportFilters()
  loadHistory()
})

const availableBuildings = computed(() => {
  const selectedPurpose = selectedFilters.value.purpose
  if (!selectedPurpose) {
    return reportFilters.value.allBuildings
  }
  return reportFilters.value.buildingsByPurpose[selectedPurpose] || []
})

watch(
  () => selectedFilters.value.purpose,
  (newPurpose, oldPurpose) => {
    if (newPurpose !== oldPurpose) {
      selectedFilters.value.building = []
    }
  },
)

async function handleRequestExport() {
  const filters = {
    searchQuery: selectedFilters.value.searchQuery || null,
    building: selectedFilters.value.building,
    purpose: selectedFilters.value.purpose || null,
    isPackage: selectedFilters.value.isPackage,
    stockStatus: selectedFilters.value.stockStatus || 'all',
  }

  isRequesting.value = true
  try {
    // Panggil API baru (POST) yang hanya mengirim permintaan
    const response = await requestExportStock(filters)

    // Tampilkan pesan sukses dari API
    showToast(response.message || 'Permintaan diterima!', 'success')

    // Muat ulang riwayat untuk melihat status PENDING
    loadHistory()
  } catch (error) {
    showToast(error.message || 'Gagal membuat permintaan.', 'error')
  } finally {
    isRequesting.value = false
  }
}

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat('id-ID').format(num)
}
const formatCurrency = (num) => {
  if (num === null || num === undefined) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}
</script>

<template>
  <div class="flex min-h-screen bg-secondary/10 font-sans text-text">
    <!-- Mobile Backdrop -->
    <div v-if="isSidebarOpen" @click="isSidebarOpen = false"
      class="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"></div>

    <!-- Sidebar -->
    <aside
      class="fixed md:sticky top-0 h-screen z-50 w-64 bg-background border-r border-secondary/20 transform transition-transform duration-300 ease-in-out flex flex-col shadow-lg md:shadow-none"
      :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'">
      <!-- Logo / Header -->
      <div class="p-6 border-b border-secondary/20 flex justify-between items-center bg-secondary/5">
        <h2 class="text-xl font-bold text-text flex items-center gap-3">
          <font-awesome-icon icon="fa-solid fa-chart-simple" class="text-primary" />
          <span>Statistik</span>
        </h2>
        <!-- Close button for mobile -->
        <button @click="isSidebarOpen = false"
          class="md:hidden text-text/60 hover:text-danger p-1 rounded-md transition-colors">
          <font-awesome-icon icon="fa-solid fa-xmark" size="lg" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto py-6 px-4 space-y-6">
        <div v-for="groupName in ['Overview', 'Laporan Utama', 'Audit & Lainnya']" :key="groupName">
          <h4 class="text-xs font-bold text-text/40 uppercase tracking-wider mb-2 px-3">
            {{ groupName }}
          </h4>
          <div class="space-y-1">
            <a v-for="item in reportsMenu.filter((m) => m.group === groupName)" :key="item.key" href="#" @click.prevent="
              activeReport = item.key;
            isSidebarOpen = false
              " class="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all" :class="activeReport === item.key
                ? 'bg-primary/10 text-primary shadow-sm font-bold ring-1 ring-primary/20'
                : 'text-text/70 hover:bg-secondary/20 hover:text-text'
                ">
              <div class="w-6 flex justify-center mr-2">
                <font-awesome-icon :icon="item.icon" />
              </div>
              <span>{{ item.label }}</span>
            </a>
          </div>
        </div>
      </nav>

      <!-- Footer / User Info -->
      <div class="p-4 border-t border-secondary/20 bg-secondary/5">
        <div class="flex items-center gap-3">
          <div
            class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
            <font-awesome-icon icon="fa-solid fa-user" />
          </div>
          <div class="text-sm">
            <p class="font-semibold text-text">Dashboard User</p>
            <p class="text-xs text-text/60">Laporan & Analisis</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Wrapper -->
    <div class="flex-1 flex flex-col min-w-0 transition-all duration-300">
      <!-- Mobile Header -->
      <header
        class="md:hidden h-16 bg-background/80 backdrop-blur-md border-b border-secondary/20 flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm">
        <button @click="isSidebarOpen = !isSidebarOpen"
          class="p-2 -ml-2 text-text/70 hover:text-primary rounded-lg hover:bg-secondary/10 transition-colors">
          <font-awesome-icon icon="fa-solid fa-bars" size="lg" />
        </button>
        <span class="font-bold text-text truncate">Statistik & Laporan</span>
        <div class="w-8"></div> <!-- Spacer -->
      </header>

      <!-- Page Content -->
      <main class="flex-1 p-4 md:p-8 overflow-x-hidden w-full">
        <div class="max-w-7xl mx-auto">
          <div
            class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 min-h-[500px] relative overflow-hidden animate-fade-in">
            <div v-if="isLoading" class="flex flex-col items-center justify-center h-80">
              <font-awesome-icon icon="fa-solid fa-circle-notch" spin class="text-primary text-4xl mb-3" />
              <span class="text-text/50 font-medium">Memuat Data...</span>
            </div>

            <div v-else-if="errorMessage" class="flex flex-col items-center justify-center h-80 text-danger">
              <div class="bg-danger/10 p-4 rounded-full mb-3">
                <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-3xl" />
              </div>
              <h3 class="font-bold text-lg">Gagal Memuat Data</h3>
              <p class="text-sm opacity-80 mt-1">{{ errorMessage }}</p>
            </div>

            <div v-else-if="activeReport === 'overview' && kpiData" class="animate-fade-in">
              <div class="flex justify-between items-center mb-6">
                <h3 class="text-lg font-bold text-text">Overall Summary</h3>
                <span class="text-xs text-text/40 font-mono">{{
                  new Date().toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })
                }}</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="kpi-card">
                  <div class="kpi-label">List Selesai</div>
                  <div class="kpi-value text-success">
                    {{ formatNumber(kpiData.listsCompletedToday) }}
                  </div>
                  <div class="kpi-icon">
                    <font-awesome-icon icon="fa-solid fa-check-double" />
                  </div>
                </div>

                <div class="kpi-card">
                  <div class="kpi-label">Item Terambil</div>
                  <div class="kpi-value text-primary">
                    {{ formatNumber(kpiData.itemsPickedToday) }}
                  </div>
                  <div class="kpi-icon">
                    <font-awesome-icon icon="fa-solid fa-box-open" />
                  </div>
                </div>

                <div class="kpi-card">
                  <div class="kpi-label">User Aktif</div>
                  <div class="kpi-value text-warning">
                    {{ formatNumber(kpiData.usersActiveToday) }}
                  </div>
                  <div class="kpi-icon">
                    <font-awesome-icon icon="fa-solid fa-users" />
                  </div>
                </div>

                <div class="kpi-card">
                  <div class="kpi-label">Total Nilai Inventaris</div>
                  <div class="kpi-value text-text text-xl md:text-2xl mt-3">
                    {{ formatCurrency(kpiData.totalInventoryValue) }}
                  </div>
                  <div class="kpi-icon">
                    <font-awesome-icon icon="fa-solid fa-vault" />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeReport === 'export-stock'" class="animate-fade-in">
              <div class="mb-6 border-b border-secondary/20 pb-4">
                <h3 class="text-lg font-bold text-text">Ekspor Laporan Stok</h3>
                <p class="text-sm text-text/50 mt-1">
                  Filter dan unduh data stok gudang dalam format Excel.
                </p>
              </div>

              <div class="grid lg:grid-cols-3 gap-8">
                <div class="lg:col-span-1">
                  <FilterContainer title="Filter Export" icon="fa-solid fa-filter">
                    <div class="space-y-5 w-full">
                      <div>
                        <label class="label-input">Cari Produk</label>
                        <SearchInput id="search-filter" v-model="selectedFilters.searchQuery"
                          placeholder="Cari SKU atau Nama Produk..." />
                      </div>

                      <div>
                        <label class="label-input">Gedung</label>
                        <select multiple id="building-filter" v-model="selectedFilters.building"
                          class="input-select h-32">
                          <option v-for="building in availableBuildings" :key="building" :value="building">
                            {{ building }}
                          </option>
                        </select>
                        <p class="text-[10px] text-text/40 mt-1 italic">
                          *Tahan Ctrl/Cmd untuk memilih lebih dari satu.
                        </p>
                      </div>

                      <div>
                        <label class="label-input">Tujuan</label>
                        <div class="relative">
                          <select id="purpose-filter" v-model="selectedFilters.purpose"
                            class="input-select appearance-none">
                            <option value="">-- Semua Tujuan --</option>
                            <option v-for="purpose in reportFilters.purposes" :key="purpose" :value="purpose">
                              {{ purpose }}
                            </option>
                          </select>
                          <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text/40">
                            <font-awesome-icon icon="fa-solid fa-chevron-down" size="xs" />
                          </div>
                        </div>
                      </div>

                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="label-input">Tipe</label>
                          <div class="relative">
                            <select id="type-filter" v-model="selectedFilters.isPackage"
                              class="input-select appearance-none">
                              <option value="">Semua</option>
                              <option value="0">Tunggal</option>
                              <option value="1">Paket</option>
                            </select>
                            <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text/40">
                              <font-awesome-icon icon="fa-solid fa-chevron-down" size="xs" />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label class="label-input">Status Stok</label>
                          <div class="relative">
                            <select id="stock-status-filter" v-model="selectedFilters.stockStatus"
                              class="input-select appearance-none">
                              <option value="positive">Positif</option>
                              <option value="negative">Minus</option>
                              <option value="all">Semua</option>
                            </select>
                            <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none text-text/40">
                              <font-awesome-icon icon="fa-solid fa-chevron-down" size="xs" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button @click="handleRequestExport" :disabled="isRequesting"
                        class="w-full py-3 bg-primary text-secondary rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">
                        <font-awesome-icon v-if="isRequesting" icon="fa-solid fa-circle-notch" spin />
                        <font-awesome-icon v-else icon="fa-solid fa-file-export" />
                        <span>{{ isRequesting ? 'Memproses...' : 'Generate Laporan' }}</span>
                      </button>
                    </div>
                  </FilterContainer>
                </div>

                <div class="lg:col-span-2">
                  <div class="flex justify-between items-center mb-4">
                    <h4 class="text-sm font-bold text-text/70 uppercase tracking-wide">
                      Riwayat Generate
                    </h4>
                    <button @click="loadHistory" :disabled="isHistoryLoading"
                      class="text-xs text-primary font-bold hover:text-primary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors">
                      <font-awesome-icon icon="fa-solid fa-rotate" :class="{ 'animate-spin': isHistoryLoading }" />
                      Refresh
                    </button>
                  </div>

                  <div
                    class="bg-background border border-secondary/20 rounded-xl overflow-hidden shadow-md overflow-x-auto overflow-y-auto relative custom-scrollbar max-h-[400px]">
                    <table class="w-full text-left text-sm min-w-[500px] border-collapse">
                      <thead
                        class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
                        <tr>
                          <th
                            class="px-6 py-3 font-bold text-xs text-text/60 uppercase sticky left-0 z-30 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                            Waktu</th>
                          <th class="px-6 py-3 font-bold text-xs text-text/60 uppercase border-b border-secondary/10">
                            Status</th>
                          <th
                            class="px-6 py-3 font-bold text-xs text-text/60 uppercase text-right border-b border-secondary/10 sticky right-0 z-30 bg-background/95 backdrop-blur-md shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
                        <template v-if="isHistoryLoading && jobHistory.length === 0">
                          <TableSkeleton v-for="n in 3" :key="`skeleton-${n}`" />
                        </template>

                        <tr v-else-if="jobHistory.length === 0" key="empty">
                          <td colspan="3" class="px-6 py-12 text-sm text-text/40 text-center italic">
                            <font-awesome-icon icon="fa-solid fa-clock-rotate-left"
                              class="mb-3 text-3xl opacity-20 block mx-auto" />
                            Belum ada riwayat permintaan.
                          </td>
                        </tr>

                        <tr v-else v-for="job in jobHistory" :key="job.id"
                          class="hover:bg-secondary/5 transition-colors group relative">
                          <td
                            class="px-6 py-4 text-text text-xs sticky left-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                            <div class="flex flex-col">
                              <span class="font-bold text-sm">{{ new Date(job.created_at).toLocaleDateString('id-ID')
                                }}</span>
                              <span class="text-text/40 text-[10px]">{{ new
                                Date(job.created_at).toLocaleTimeString('id-ID') }}</span>
                            </div>
                          </td>
                          <td class="px-6 py-4">
                            <span v-if="job.status === 'COMPLETED'"
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20">
                              <font-awesome-icon icon="fa-solid fa-check" /> Selesai
                            </span>
                            <span v-else-if="job.status === 'FAILED'"
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20"
                              :title="job.error_message">
                              <font-awesome-icon icon="fa-solid fa-xmark" /> Gagal
                            </span>
                            <span v-else
                              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-warning/10 text-warning border border-warning/20">
                              <span class="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                              Proses
                            </span>
                          </td>
                          <td
                            class="px-6 py-4 text-right sticky right-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                            <a v-if="job.status === 'COMPLETED'" :href="job.download_url" download
                              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold hover:bg-primary hover:text-secondary transition-all shadow-sm">
                              <font-awesome-icon icon="fa-solid fa-download" /> Unduh
                            </a>
                            <span v-else-if="job.status === 'FAILED'"
                              class="text-xs text-danger/60 italic cursor-help underline decoration-dotted"
                              :title="job.error_message">
                              Lihat Error
                            </span>
                            <span v-else class="text-xs text-text/30 italic"> Menunggu... </span>
                          </td>
                        </tr>
                      </TransitionGroup>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- [NEW] Attendance Stats Section -->
            <div v-else class="flex flex-col items-center justify-center h-80 text-text/30">
              <font-awesome-icon icon="fa-solid fa-screwdriver-wrench" class="text-4xl mb-3 opacity-20" />
              <h3 class="text-lg font-medium italic">Laporan ini sedang dalam pengembangan.</h3>
              <p class="text-sm">Silakan kembali lagi nanti.</p>
            </div>
          </div>
        </div>
      </main>
    </div>


  </div>
</template>

<style scoped>
.label-input {
  @apply block text-xs font-bold text-text/60 uppercase mb-1.5;
}

.input-select {
  @apply w-full bg-background border border-secondary/30 text-text text-sm rounded-lg focus:ring-1 focus:ring-primary/20 focus:border-primary block p-2.5 transition-colors outline-none;
}

.kpi-card {
  @apply bg-secondary/5 border border-secondary/20 p-5 rounded-xl relative overflow-hidden transition-all hover:border-primary/30 hover:bg-secondary/10;
}

.kpi-label {
  @apply text-xs font-bold uppercase text-text/50 tracking-wider mb-2 relative z-10;
}

.kpi-value {
  @apply text-3xl font-bold relative z-10 font-mono tracking-tight;
}

.kpi-icon {
  @apply absolute -bottom-3 -right-3 text-6xl text-text/5 opacity-[0.03] transform rotate-[-15deg] pointer-events-none;
}

/* Animation */
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
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
