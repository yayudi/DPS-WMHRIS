<!-- frontend\src\views\hr\AttendanceView.vue -->
<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Tabs from '@/components/ui/Tabs.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import SummaryView from '@/components/hr/SummaryView.vue'
import DetailView from '@/components/hr/DetailView.vue'
import AttendanceStats from '@/components/stats/AttendanceStats.vue'
import Modal from '@/components/ui/Modal.vue'
import UploadForm from '@/components/ui/UploadForm.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useToast } from '@/composables/useToast.js'
import { getAbsensiData, getAvailableIndexes, uploadAbsensiFile } from '@/api/helpers/attendance.js'
import { fetchAllUsers } from '@/api/helpers/admin.js'

// --- STATE ---
const authStore = useAuthStore()
const { show } = useToast()
const isUploadModalOpen = ref(false)
const isUploading = ref(false)
const isHeaderExpanded = ref(true)
const activeTab = ref('statistik')
const summary = ref(null)
const users = ref([])
const availableIndexes = ref({})
const filters = ref([])
const filterValues = ref({
  year: '',
  month: '',
  name: [],
})
const allUsersForFilter = ref([])
const dataNotFoundForCurrentUser = ref(false)
const isLoadingIndexes = ref(true)
const isLoadingUsers = ref(false)
const isDataLoading = ref(false)
const canViewAll = computed(() => authStore.user?.permissions?.includes('view-other-attendance'))

const displayedUsers = computed(() => {
  if (canViewAll.value && filterValues.value.name && filterValues.value.name.length > 0) {
    const selectedIds = filterValues.value.name.map((n) => n.value)
    return users.value.filter((u) => selectedIds.includes(u.id))
  }
  return users.value
})

// --- WATCHERS & LIFECYCLE ---
watch(
  [() => filterValues.value.year, () => filterValues.value.month, () => authStore.user],
  async ([year, month, user]) => {
    if (!year || !month || !user) return

    dataNotFoundForCurrentUser.value = false

    dataNotFoundForCurrentUser.value = false
    isDataLoading.value = true

    try {
      const data = await getAbsensiData(year, month)
      summary.value = data.summary || null
      let fetchedUsers = data.users || []

      // Logika RBAC (Role Based Access Control)
      if (!canViewAll.value) {
        const currentUserData = fetchedUsers.find(
          (u) => u.nama.toLowerCase() === authStore.user.username.toLowerCase(),
        )
        users.value = currentUserData ? [currentUserData] : []
        dataNotFoundForCurrentUser.value = !currentUserData
      } else {
        users.value = fetchedUsers
      }
    } catch (err) {
      show('Gagal memuat data absensi.', 'error')
      console.error('Fetch absensi error:', err)
      users.value = []
      summary.value = null
    } finally {
      isDataLoading.value = false
    }
  },
)

// 2. Watcher Khusus Tahun: Update Opsi Bulan saat Tahun Berubah (FIX BUG STUCK)
watch(
  () => filterValues.value.year,
  (newYear) => {
    if (!newYear || !availableIndexes.value[newYear]) return

    // Ambil daftar bulan yang tersedia untuk tahun baru
    const availableMonths = [...availableIndexes.value[newYear]].sort((a, b) => a - b)
    const availableYears = Object.keys(availableIndexes.value).sort((a, b) => b - a)

    // Update struktur filter (dropdown) agar opsi bulan sesuai tahun
    updateFilterOptions(availableYears, availableMonths)

    // Validasi: Apakah bulan yang sedang dipilih ada di tahun baru?
    const currentMonth = parseInt(filterValues.value.month)
    if (!availableMonths.includes(currentMonth)) {
      // Jika tidak ada, pilih bulan terakhir yang tersedia di tahun tersebut
      // (Misal pindah dari Des 2025 ke 2026 yang baru ada data Jan)
      filterValues.value.month = availableMonths[availableMonths.length - 1]
    }
  },
)

// 3. Watcher User Login: Init Data Awal
watch(
  () => authStore.user,
  async (user) => {
    if (user) {
      isLoadingIndexes.value = true
      try {
        const indexes = await getAvailableIndexes()
        availableIndexes.value = indexes
        initializeFilters(indexes)
      } catch (err) {
        show('Gagal memuat filter data.', 'error')
        console.error('Gagal mengambil indeks absensi:', err)
      } finally {
        isLoadingIndexes.value = false
      }

      if (canViewAll.value) {
        isLoadingUsers.value = true
        try {
          const usersList = await fetchAllUsers()
          allUsersForFilter.value = usersList.map((u) => ({
            label: u.nickname || u.username,
            value: u.id,
          }))
        } catch (err) {
          show('Gagal memuat daftar nama user untuk filter.', 'error')
          console.error('Gagal mengambil daftar user:', err)
        } finally {
          isLoadingUsers.value = false
        }
      }
    }
  },
  { immediate: true },
)

// --- METHODS ---
function initializeFilters(indexes) {
  const years = Object.keys(indexes).sort((a, b) => b - a)
  if (years.length === 0) return

  const latestYear = years[0]
  const months = [...indexes[latestYear]].sort((a, b) => a - b)
  if (months.length === 0) return
  const latestMonth = months[months.length - 1]

  filterValues.value = {
    year: latestYear,
    month: latestMonth,
    name: [],
  }
  updateFilterOptions(years, months)
}

function updateFilterOptions(years, months) {
  filters.value = [
    {
      type: 'select',
      key: 'year',
      label: 'Tahun',
      options: years.map((y) => ({ label: y, value: y })),
    },
    {
      type: 'select',
      key: 'month',
      label: 'Bulan',
      options: months.map((m) => ({
        label: new Date(2000, parseInt(m) - 1).toLocaleString('id-ID', { month: 'long' }),
        value: m,
      })),
    },
  ]
}

function clearFilters() {
  initializeFilters(availableIndexes.value)
  filterValues.value.name = []
}

// --- UPLOAD ---
async function handleUpload(formData) {
  isUploading.value = true
  show('Mengupload file...', 'info')
  try {
    const response = await uploadAbsensiFile(formData)

    if (response.success) {
      isUploadModalOpen.value = false

      // CASE 1: Job Queue (Async)
      if (response.jobId) {
        show(response.message || 'File masuk antrian background.', 'success')
        // Refresh index best effort
        try {
          const newIndexes = await getAvailableIndexes()
          availableIndexes.value = newIndexes
          // Jangan force update filterValues karena kita tidak tahu target tahun/bulan
        } catch (e) {
          console.warn('Gagal refresh index background', e)
        }
      }
      // CASE 2: Direct Processing (Sync - Legacy Support)
      else if (response.processed) {
        show('Upload berhasil! Menampilkan data terbaru.', 'success')
        try {
          const newIndexes = await getAvailableIndexes()
          availableIndexes.value = newIndexes
          const years = Object.keys(newIndexes).sort((a, b) => b - a)
          // Safe check
          const targetYear = response.processed?.year
          const months = targetYear ? newIndexes[targetYear] || [] : []

          updateFilterOptions(
            years,
            months.sort((a, b) => a - b),
          )
        } catch (indexError) {
          console.error('Gagal memperbarui index setelah upload:', indexError)
          show('Data berhasil diupload, tetapi gagal memperbarui filter.', 'warning')
        }

        const { year, month } = response.processed || {}
        if (year && month) {
          filterValues.value.year = year.toString()
          filterValues.value.month = String(month).padStart(2, '0')
        }
      }
    } else {
      throw new Error(response.message || 'Terjadi kesalahan di server.')
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message || 'Gagal mengupload file.'
    show(errorMessage, 'error')
    console.error('Upload error:', error)
  } finally {
    isUploading.value = false
  }
}
</script>
<template>
  <div class="bg-secondary/20 min-h-screen">
    <header
      class="bg-background/80 backdrop-blur-sm sticky top-[65px] z-30 border-b border-secondary/20 transition-all duration-300">
      <transition enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="transform -translate-y-4 opacity-0 max-h-0"
        enter-to-class="transform translate-y-0 opacity-100 max-h-[500px]"
        leave-active-class="transition-all duration-300 ease-in"
        leave-from-class="transform translate-y-0 opacity-100 max-h-[500px]"
        leave-to-class="transform -translate-y-4 opacity-0 max-h-0">
        <div v-show="isHeaderExpanded" class="overflow-hidden">
          <div class="py-3 px-4 md:px-6 flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <Tabs :tabs="[
              { label: 'Statistik', value: 'statistik' },
              { label: 'Ringkasan', value: 'summary' },
              { label: 'Detail Log', value: 'detail' },
            ]" v-model="activeTab" class="w-full md:w-auto overflow-x-auto" />

            <div class="flex flex-col md:flex-row gap-4 flex-1 items-stretch md:items-center">
              <FilterBar :filters="filters" v-model="filterValues" @clear="clearFilters" class="w-full md:w-auto" />

              <div v-if="canViewAll" class="w-full md:flex-1 min-w-[200px]">
                <BaseSelect v-model="filterValues.name" :options="allUsersForFilter" :multiple="true"
                  :loading="isLoadingUsers" :disabled="isLoadingUsers" label="label" track-by="value"
                  placeholder="Pilih satu atau beberapa nama..." class="w-full" />
              </div>

              <button v-if="canViewAll" @click="isUploadModalOpen = true"
                class="bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap w-full md:w-auto">
                <font-awesome-icon icon="fa-solid fa-file-import" />
                <span>Import Data</span>
              </button>
            </div>
          </div>
        </div>
      </transition>

      <!-- Toggle Handle -->
      <div @click="isHeaderExpanded = !isHeaderExpanded"
        class="lg:hidden flex justify-center items-center py-1 cursor-pointer hover:bg-secondary/10 text-text/40 hover:text-primary transition-colors border-t border-secondary/10"
        title="Toggle Header">
        <font-awesome-icon :icon="isHeaderExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" />
      </div>
    </header>

    <main class="p-6">
      <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
        <div v-if="activeTab === 'summary'">
          <p v-if="dataNotFoundForCurrentUser" class="text-center text-text/60 py-10">
            Data absensi Anda untuk bulan ini tidak ditemukan.
          </p>
          <SummaryView v-else-if="displayedUsers.length > 0 || isDataLoading" :users="displayedUsers"
            :year="parseInt(filterValues.year)" :month="parseInt(filterValues.month)" :global-info="summary"
            :loading="isDataLoading" />
          <p v-else class="text-center text-text/60 py-10">
            Pilih tahun dan bulan untuk menampilkan data, atau tidak ada data yang cocok dengan
            filter.
          </p>
        </div>

        <div v-else-if="activeTab === 'statistik'">
          <AttendanceStats :users="displayedUsers" :summary-info="summary || {}" :year="filterValues.year"
            :month="filterValues.month" :loading="isDataLoading" />
        </div>

        <div v-else>
          <p v-if="dataNotFoundForCurrentUser" class="text-center text-text/60 py-10">
            Data absensi Anda untuk bulan ini tidak ditemukan.
          </p>
          <DetailView v-else-if="displayedUsers.length > 0" :user="filterValues.name.length === 1
            ? displayedUsers[0]
            : !canViewAll
              ? displayedUsers[0]
              : null
            " :users="filterValues.name.length > 1
              ? displayedUsers
              : canViewAll && filterValues.name.length === 0
                ? users
                : !canViewAll
                  ? displayedUsers
                  : null
              " :year="parseInt(filterValues.year)" :month="parseInt(filterValues.month)" :loading="isDataLoading" />
          <p v-else class="text-center text-text/60 py-10">Belum ada log detail.</p>
        </div>
      </div>
    </main>

    <!-- MODAL UPLOAD -->
    <Modal :show="isUploadModalOpen" @close="isUploadModalOpen = false" title="Upload File Absensi">
      <!-- Menggunakan Component UploadForm Baru dengan Drag Drop & Dry Run -->
      <UploadForm @submit="handleUpload" :loading="isUploading" accept=".csv" submit-label="Mulai Import"
        :show-dry-run="true" />

      <template #footer>
        <button @click="isUploadModalOpen = false"
          class="bg-background border border-secondary/30 text-text/80 hover:bg-secondary/20 text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          Tutup
        </button>
      </template>
    </Modal>
  </div>
</template>
