<!-- frontend\src\views\Stats.vue -->
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import {
  fetchKpiSummary,
  requestExportStock,
  getUserExportJobs,
  fetchReportFilters,
} from '@/api/helpers/stats.js'
import { useToast } from '@/composables/UseToast.js'
import SearchInput from '@/components/global/SearchInput.vue'

const { show: showToast } = useToast()

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
const activeReport = ref('kpi')

// Menu navigasi untuk sidebar (dengan ikon)
const reportsMenu = [
  { key: 'kpi', label: 'Ringkasan KPI', group: 'Overview', icon: 'fa-solid fa-chart-pie' },
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
    key: 'user-performance',
    label: 'Laporan Kinerja Pengguna',
    group: 'Laporan Utama',
    icon: 'fa-solid fa-users',
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
  if (activeReport.value === 'kpi') {
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
  // Ini adalah log yang kita perlukan untuk debugging
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
  <div class="p-6">
    <h2 class="text-2xl font-bold text-text mb-6">Statistik & Laporan</h2>

    <div class="flex flex-col md:flex-row gap-6">
      <aside class="w-full md:w-1/4 lg:w-1/5">
        <nav class="space-y-4">
          <div>
            <h4 class="text-xs font-semibold text-text/50 uppercase tracking-wider mb-2">
              Overview
            </h4>
            <a
              v-for="item in reportsMenu.filter((m) => m.group === 'Overview')"
              :key="item.key"
              href="#"
              @click.prevent="activeReport = item.key"
              class="flex items-center px-3 py-2 text-sm font-medium rounded-md"
              :class="
                activeReport === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-text/80 hover:bg-secondary/10'
              "
            >
              <font-awesome-icon :icon="item.icon" class="w-5 mr-3 text-center" />
              <span>{{ item.label }}</span>
            </a>
          </div>

          <div>
            <h4 class="text-xs font-semibold text-text/50 uppercase tracking-wider mb-2">
              Laporan Utama
            </h4>
            <a
              v-for="item in reportsMenu.filter((m) => m.group === 'Laporan Utama')"
              :key="item.key"
              href="#"
              @click.prevent="activeReport = item.key"
              class="flex items-center px-3 py-2 text-sm font-medium rounded-md"
              :class="
                activeReport === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-text/80 hover:bg-secondary/10'
              "
            >
              <font-awesome-icon :icon="item.icon" class="w-5 mr-3 text-center" />
              <span>{{ item.label }}</span>
            </a>
          </div>

          <div>
            <h4 class="text-xs font-semibold text-text/50 uppercase tracking-wider mb-2">
              Audit & Lainnya
            </h4>
            <a
              v-for="item in reportsMenu.filter((m) => m.group === 'Audit & Lainnya')"
              :key="item.key"
              href="#"
              @click.prevent="activeReport = item.key"
              class="flex items-center px-3 py-2 text-sm font-medium rounded-md"
              :class="
                activeReport === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-text/80 hover:bg-secondary/10'
              "
            >
              <font-awesome-icon :icon="item.icon" class="w-5 mr-3 text-center" />
              <span>{{ item.label }}</span>
            </a>
          </div>
        </nav>
      </aside>

      <main class="w-full md:w-3/4 lg:w-4/5">
        <div
          class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 min-h-[400px]"
        >
          <div v-if="isLoading" class="flex items-center justify-center h-60">
            <font-awesome-icon
              icon="fa-solid fa-spinner"
              class="animate-spin text-primary text-3xl"
            />
          </div>
          <div v-else-if="errorMessage" class="text-center text-accent h-60">
            <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="text-3xl mb-4" />
            <h3 class="font-semibold text-lg">Gagal Memuat Data</h3>
            <p class="text-sm">{{ errorMessage }}</p>
          </div>
          <div v-else-if="activeReport === 'kpi' && kpiData">
            <h3 class="text-lg font-semibold text-text mb-4">Ringkasan KPI (Hari Ini)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="bg-secondary/10 border border-secondary/20 p-4 rounded-lg">
                <div class="text-xs uppercase text-text/60 font-semibold">
                  List Selesai (Hari Ini)
                </div>
                <div class="text-3xl font-bold text-primary mt-2">
                  {{ formatNumber(kpiData.listsCompletedToday) }}
                </div>
              </div>
              <div class="bg-secondary/10 border border-secondary/20 p-4 rounded-lg">
                <div class="text-xs uppercase text-text/60 font-semibold">
                  Item Terambil (Hari Ini)
                </div>
                <div class="text-3xl font-bold text-primary mt-2">
                  {{ formatNumber(kpiData.itemsPickedToday) }}
                </div>
              </div>
              <div class="bg-secondary/10 border border-secondary/20 p-4 rounded-lg">
                <div class="text-xs uppercase text-text/60 font-semibold">
                  User Aktif (Hari Ini)
                </div>
                <div class="text-3xl font-bold text-primary mt-2">
                  {{ formatNumber(kpiData.usersActiveToday) }}
                </div>
              </div>
              <div class="bg-secondary/10 border border-secondary/20 p-4 rounded-lg">
                <div class="text-xs uppercase text-text/60 font-semibold">
                  Total Nilai Inventaris
                </div>
                <div class="text-3xl font-bold text-primary mt-2">
                  {{ formatCurrency(kpiData.totalInventoryValue) }}
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="activeReport === 'export-stock'">
            <h3 class="text-lg font-semibold text-text mb-4">Ekspor Laporan Stok</h3>

            <div class="space-y-4 p-4 bg-secondary/10 border border-secondary/20 rounded-lg">
              <div>
                <label for="search-filter" class="block text-sm font-medium text-text/90 mb-1">
                  Cari SKU atau Nama (Opsional)
                </label>
                <SearchInput
                  id="search-filter"
                  v-model="selectedFilters.searchQuery"
                  placeholder="Cari SKU atau Nama Produk..."
                />
              </div>

              <div>
                <label for="building-filter" class="block text-sm font-medium text-text/90 mb-1">
                  Filter Berdasarkan Gedung (Opsional)
                </label>
                <select
                  multiple
                  id="building-filter"
                  v-model="selectedFilters.building"
                  class="w-full bg-background border border-secondary/30 text-text text-sm rounded-md focus:ring-primary/50 focus:border-primary block p-2 form-multiselect"
                  size="4"
                >
                  <option v-for="building in availableBuildings" :key="building" :value="building">
                    {{ building }}
                  </option>
                </select>
                <p class="text-xs text-text/60 mt-1">
                  Tahan Ctrl/Cmd untuk memilih lebih dari satu.
                </p>
              </div>

              <div>
                <label for="purpose-filter" class="block text-sm font-medium text-text/90 mb-1">
                  Filter Berdasarkan Tujuan (Opsional)
                </label>
                <select
                  id="purpose-filter"
                  v-model="selectedFilters.purpose"
                  class="w-full bg-background border border-secondary/30 text-text text-sm rounded-md focus:ring-primary/50 focus:border-primary block p-2 form-select"
                >
                  <option value="">-- Semua Tujuan --</option>
                  <option v-for="purpose in reportFilters.purposes" :key="purpose" :value="purpose">
                    {{ purpose }}
                  </option>
                </select>
              </div>

              <div>
                <label for="type-filter" class="block text-sm font-medium text-text/90 mb-1">
                  Filter Tipe Produk (Opsional)
                </label>
                <select
                  id="type-filter"
                  v-model="selectedFilters.isPackage"
                  class="w-full bg-background border border-secondary/30 text-text text-sm rounded-md focus:ring-primary/50 focus:border-primary block p-2 form-select"
                >
                  <option value="">-- Semua Tipe --</option>
                  <option value="0">Item Tunggal</option>
                  <option value="1">Paket</option>
                </select>
              </div>

              <div>
                <label
                  for="stock-status-filter"
                  class="block text-sm font-medium text-text/90 mb-1"
                >
                  Filter Status Stok
                </label>
                <select
                  id="stock-status-filter"
                  v-model="selectedFilters.stockStatus"
                  class="w-full bg-background border border-secondary/30 text-text text-sm rounded-md focus:ring-primary/50 focus:border-primary block p-2 form-select"
                >
                  <option value="positive">Hanya Stok Positif (Default)</option>
                  <option value="negative">Hanya Stok Minus</option>
                  <option value="all">Semua Stok (Termasuk 0)</option>
                </select>
              </div>

              <button
                @click="handleRequestExport"
                :disabled="isRequesting"
                class="w-full px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90"
              >
                <font-awesome-icon
                  v-if="isRequesting"
                  icon="fa-solid fa-spinner"
                  class="animate-spin"
                />
                <font-awesome-icon v-else icon="fa-solid fa-paper-plane" />
                <span>{{
                  isRequesting ? 'Mengirim Permintaan...' : 'Buat Laporan di Latar Belakang'
                }}</span>
              </button>
            </div>

            <div class="mt-8">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-text">Riwayat Laporan Anda</h3>
                <button
                  @click="loadHistory"
                  :disabled="isHistoryLoading"
                  class="text-sm text-primary hover:underline disabled:opacity-50"
                >
                  <font-awesome-icon
                    icon="fa-solid fa-sync"
                    :class="{ 'animate-spin': isHistoryLoading }"
                  />
                  Muat Ulang
                </button>
              </div>
              <div class="overflow-x-auto border border-secondary/20 rounded-lg">
                <table class="min-w-full divide-y divide-secondary/20">
                  <thead class="bg-secondary/10">
                    <tr>
                      <th
                        scope="col"
                        class="px-4 py-2 text-left text-xs font-medium text-text/70 uppercase"
                      >
                        Tanggal
                      </th>
                      <th
                        scope="col"
                        class="px-4 py-2 text-left text-xs font-medium text-text/70 uppercase"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        class="px-4 py-2 text-left text-xs font-medium text-text/70 uppercase"
                      >
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-background divide-y divide-secondary/20">
                    <tr v-if="jobHistory.length === 0 && !isHistoryLoading">
                      <td colspan="3" class="px-4 py-3 text-sm text-text/60 text-center italic">
                        Belum ada riwayat.
                      </td>
                    </tr>
                    <tr v-if="isHistoryLoading">
                      <td colspan="3" class="px-4 py-3 text-sm text-text/60 text-center">
                        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin" />
                        Memuat...
                      </td>
                    </tr>
                    <tr v-for="job in jobHistory" :key="job.id">
                      <td class="px-4 py-3 text-sm text-text">
                        {{ new Date(job.created_at).toLocaleString('id-ID') }}
                      </td>
                      <td class="px-4 py-3 text-sm">
                        <span v-if="job.status === 'COMPLETED'" class="font-medium text-green-600">
                          Selesai
                        </span>
                        <span
                          v-else-if="job.status === 'FAILED'"
                          class="font-medium text-red-600"
                          :title="job.error_message"
                        >
                          Gagal
                        </span>
                        <span v-else class="font-medium text-yellow-500">{{ job.status }}...</span>
                      </td>
                      <td class="px-4 py-3 text-sm">
                        <a
                          v-if="job.status === 'COMPLETED'"
                          :href="job.download_url"
                          download
                          class="text-primary font-medium hover:underline"
                        >
                          Unduh
                        </a>
                        <span
                          v-else-if="job.status === 'FAILED'"
                          class="text-text/50"
                          :title="job.error_message"
                        >
                          Gagal
                        </span>
                        <span v-else class="text-text/50">Menunggu</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-text/50 h-60 flex items-center justify-center">
            <h3 class="text-lg italic">Laporan '{{ activeReport }}' belum diimplementasikan.</h3>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
