<!-- frontend\src\views\hr\AttendanceView.vue -->
<script setup>
import { ref, watch, computed, defineAsyncComponent } from 'vue'
import { dayjs } from '@/api/helpers/time.js'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast.js'
import { getAbsensiRange } from '@/api/helpers/attendance.js'
import { useMasterDataStore } from '@/stores/masterData'
import { useMobile } from '@/composables/useMobile.js'
import { calculateSummaryForUser } from '@/api/helpers/summary.js'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import FilterToggle from '@/components/ui/FilterToggle.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

// Lazy load tab components
const DetailView = defineAsyncComponent(() => import('@/components/hr/DetailView.vue'))
const SummaryView = defineAsyncComponent(() => import('@/components/hr/SummaryView.vue'))
const AttendanceStats = defineAsyncComponent(() => import('@/components/stats/AttendanceStats.vue'))
const AttendanceUploadTab = defineAsyncComponent(() => import('@/components/hr/AttendanceUploadTab.vue'))
const AttendanceExclusionsModal = defineAsyncComponent(() => import('@/components/hr/AttendanceExclusionsModal.vue'))

// --- STATE ---
const { toast } = useToast()
const authStore = useAuthStore()
const masterData = useMasterDataStore()
const activeTab = ref('statistik')
const summary = ref(null)
const users = ref([])
const allUsersForFilter = ref([])
const dataNotFoundForCurrentUser = ref(false)
const isExclusionsModalOpen = ref(false)
const isHeaderExpanded = ref(true)
const isLoadingUsers = ref(false)
const isDataLoading = ref(false)
const showFilters = ref(false)
const { isMobile } = useMobile()
const mobileLayout = ref(isMobile.value ? 'card' : 'compact') // 'card' | 'compact'
const filterValues = ref({
  startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
  endDate: dayjs().endOf('month').format('YYYY-MM-DD'),
  name: []
})

watch(isMobile, mobile => {
  mobileLayout.value = mobile ? 'card' : 'compact'
})
const canViewAll = computed(() => authStore.hasPermission('attendance.view_other'))

const displayedUsers = computed(() => {
  if (canViewAll.value && filterValues.value.name && filterValues.value.name.length > 0) {
    const selectedIds = filterValues.value.name.map(n => n.value)
    return users.value.filter(u => selectedIds.includes(u.id))
  }
  return users.value
})

const currentYear = computed(() => dayjs(filterValues.value.startDate).year())
const currentMonth = computed(() => dayjs(filterValues.value.startDate).month() + 1)

// --- FETCH DATA ---
async function fetchAttendanceData() {
  const startDate = filterValues.value.startDate
  const endDate = filterValues.value.endDate
  const user = authStore.user

  if (!startDate || !endDate || !user) return

  dataNotFoundForCurrentUser.value = false
  isDataLoading.value = true

  try {
    // Use new Range API
    const data = await getAbsensiRange(startDate, endDate)
    summary.value = data.summary || null
    let fetchedUsers = data.users || []

    // Logika RBAC (Role Based Access Control)
    if (!canViewAll.value) {
      const currentUserData = fetchedUsers.find(u => u.nama.toLowerCase() === authStore.user.username.toLowerCase())
      users.value = currentUserData ? [currentUserData] : []
      dataNotFoundForCurrentUser.value = !currentUserData
    } else {
      users.value = fetchedUsers
    }
  } catch {
    toast('Gagal memuat data absensi.', 'error')
    users.value = []
    summary.value = null
  } finally {
    isDataLoading.value = false
  }
}

// --- WATCHERS & LIFECYCLE ---
watch([() => filterValues.value.startDate, () => filterValues.value.endDate, () => authStore.user], () => {
  // Basic debounce or check if valid
  fetchAttendanceData()
})

function handleRefresh() {
  fetchAttendanceData()
  toast('Data berhasil diperbarui', 'success')
}

// Watcher User Login: Init Data Awal
watch(
  () => authStore.user,
  async user => {
    if (user) {
      fetchAttendanceData() // Fetch initial

      if (canViewAll.value) {
        isLoadingUsers.value = true
        try {
          const usersList = await masterData.getUsers()
          allUsersForFilter.value = usersList.map(u => ({
            label: u.nickname || u.username,
            value: u.id
          }))
        } catch (err) {
          console.error('Gagal mengambil daftar user:', err)
        } finally {
          isLoadingUsers.value = false
        }
      }
    }
  },
  { immediate: true }
)

function clearFilters() {
  filterValues.value.name = []
  // Reset date to current month
  filterValues.value.startDate = dayjs().startOf('month').format('YYYY-MM-DD')
  filterValues.value.endDate = dayjs().endOf('month').format('YYYY-MM-DD')
}

// --- EXPORT ---
async function handleExportExcel() {
  if (displayedUsers.value.length === 0) {
    toast('Tidak ada data untuk diekspor', 'warning')
    return
  }
  toast('Sedang menyiapkan file Excel...', 'info')

  try {
    // Siapkan Sheet Ringkasan
    const summaryData = displayedUsers.value.map(user => {
      const stats = calculateSummaryForUser(user, currentYear.value, currentMonth.value, summary.value, authStore)
      return {
        'Nama Karyawan': user.nama || user.username || '-',
        'Hadir (Hari)': stats.hadirDays,
        'Libur (Hari)': stats.holidayDays,
        'Absen (Hari)': stats.absenceDays,
        Telat: stats.telatHours,
        'Pulang Cepat': stats.earlyOutHours,
        Lembur: stats.lemburHours,
        'Denda Telat (Rp)': stats.dendaTelat,
        'Uang Lembur (Rp)': stats.uangLembur
      }
    })

    // Siapkan Sheet Detail
    const detailData = []
    displayedUsers.value.forEach(user => {
      const logs = Array.isArray(user.logs) ? user.logs : []
      logs.forEach(day => {
        let status = ''
        if (day.status === 2) status = 'Libur'
        else if (day.status === 3) status = 'Tidak Ada Log'
        else if (day.isEmpty && !day.holiday) status = 'Absen'
        else status = 'Hadir'

        detailData.push({
          'Nama Karyawan': user.nama || user.username || '-',
          Tanggal:
            day.fullDate ||
            `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(day.tanggal).padStart(2, '0')}`,
          'Jam Masuk': day.rawMasuk || '-',
          'Jam Keluar': day.rawKeluar || '-',
          Status: status,
          Keterangan: day.notes?.join(', ') || ''
        })
      })
    })

    // Buat Workbook
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const wsSummary = XLSX.utils.json_to_sheet(summaryData)
    const wsDetail = XLSX.utils.json_to_sheet(detailData)

    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan')
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Absensi')

    // Download file
    const filename = `Laporan_Absensi_${filterValues.value.startDate}_to_${filterValues.value.endDate}.xlsx`
    XLSX.writeFile(wb, filename)
    toast('Berhasil mengunduh Excel', 'success')
  } catch (err) {
    console.error('Export Excel failed:', err)
  }
}
</script>
<template>
  <header
    class="flex flex-col gap-2 bg-background shadow-md fixed left-0 top-[53px] w-full z-[100] px-6 py-1 lg:px-0 transition-all duration-300"
  >
    <transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="transform -translate-y-4 opacity-0 max-h-0"
      enter-to-class="transform translate-y-0 opacity-100 max-h-[500px]"
      leave-active-class="transition-all duration-300 ease-in"
      leave-from-class="transform translate-y-0 opacity-100 max-h-[500px]"
      leave-to-class="transform -translate-y-4 opacity-0 max-h-0"
    >
      <div v-show="isHeaderExpanded" class="overflow-hidden py-2 px-1 sm:px-0 mx-[7vw]">
        <div class="flex flex-col gap-3 mx-auto w-full lg:mx-0">
          <!-- TOP ROW: Tabs and Action Buttons -->
          <div class="flex flex-col md:flex-row justify-between items-center gap-3 w-full">
            <BaseTabs
              :tabs="
                canViewAll
                  ? [
                      { label: 'Statistik', value: 'statistik' },
                      { label: 'Ringkasan', value: 'summary' },
                      { label: 'Detail Log', value: 'detail' },
                      { label: 'Unggah Data', value: 'upload' }
                    ]
                  : [
                      { label: 'Statistik', value: 'statistik' },
                      { label: 'Ringkasan', value: 'summary' },
                      { label: 'Detail Log', value: 'detail' }
                    ]
              "
              v-model="activeTab"
              class="overflow-x-auto shrink-0 w-full md:w-auto custom-scrollbar"
            />

            <div class="flex flex-row items-center justify-end gap-3 shrink-0 w-full md:w-auto">
              <FilterToggle v-model="showFilters" />
              <button
                v-if="canViewAll"
                @click="handleExportExcel"
                title="Export Excel"
                class="h-[42px] px-4 flex items-center justify-center gap-2 border border-primary/30 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-all bg-primary/5 active:scale-[0.98] whitespace-nowrap flex-1 md:flex-none shadow-sm"
              >
                <font-awesome-icon icon="fa-solid fa-file-export" />
                <span class="hidden md:inline">Export</span>
              </button>

              <button
                v-if="canViewAll"
                @click="isExclusionsModalOpen = true"
                title="Pengecualian Absen"
                class="bg-accent/10 border border-accent/30 text-accent hover:bg-accent/30 text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap flex-1 md:flex-none shadow-sm"
              >
                <font-awesome-icon icon="fa-solid fa-user-shield" />
              </button>
            </div>
          </div>

          <!-- BOTTOM ROW: FilterBar -->
          <div v-show="showFilters" class="animate-fade-in-down w-full">
            <FilterBar :filters="[]" v-model="filterValues" @clear="clearFilters" class="flex-grow w-full md:w-auto">
              <template #prepend>
                <div class="flex gap-2">
                  <DateRangeFilter
                    v-model:startDate="filterValues.startDate"
                    v-model:endDate="filterValues.endDate"
                    align="left"
                    class="w-full sm:w-fit shrink-0 md:w-1/2"
                  />

                  <div v-if="canViewAll" class="w-full sm:w-fit sm:min-w-[200px] md:w-1/2 shrink-0">
                    <BaseSelect
                      v-model="filterValues.name"
                      :options="allUsersForFilter"
                      :multiple="true"
                      :loading="isLoadingUsers"
                      :disabled="isLoadingUsers"
                      label="label"
                      track-by="value"
                      placeholder="Cari nama karyawan..."
                      class="w-full"
                    />
                  </div>
                </div>
              </template>
              <template #filter-actions>
                <div
                  class="flex items-center bg-secondary/20 rounded-lg p-1 border border-secondary/20 lg:hidden shrink-0 h-[42px]"
                >
                  <button
                    @click="mobileLayout = 'card'"
                    class="p-2 rounded-md transition-all duration-200 flex items-center justify-center w-8 h-8"
                    :class="
                      mobileLayout === 'card'
                        ? 'bg-primary text-secondary shadow-sm'
                        : 'text-text/60 hover:text-primary'
                    "
                    title="Tampilan Card"
                  >
                    <font-awesome-icon icon="fa-solid fa-grip" />
                  </button>
                  <button
                    @click="mobileLayout = 'compact'"
                    class="p-2 rounded-md transition-all duration-200 flex items-center justify-center w-8 h-8"
                    :class="
                      mobileLayout === 'compact'
                        ? 'bg-primary text-secondary shadow-sm'
                        : 'text-text/60 hover:text-primary'
                    "
                    title="Tampilan Compact"
                  >
                    <font-awesome-icon icon="fa-solid fa-list" />
                  </button>
                </div>
              </template>
            </FilterBar>
          </div>
        </div>
      </div>
    </transition>

    <!-- Toggle Handle -->
    <div
      @click="isHeaderExpanded = !isHeaderExpanded"
      class="lg:hidden flex justify-center items-center py-1 cursor-pointer hover:bg-secondary/10 text-text/40 hover:text-primary transition-colors border-t border-secondary/10"
      title="Toggle Header"
    >
      <font-awesome-icon :icon="isHeaderExpanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" />
    </div>
  </header>

  <main class="mt-10 lg:mt-32">
    <div class="bg-secondary/20 rounded-xl shadow-md border border-secondary/20 px-6 py-4 space-y-3">
      <KeepAlive>
        <div v-if="activeTab === 'summary'" key="summary">
          <p v-if="dataNotFoundForCurrentUser" class="text-center text-text/60 py-10">
            Data absensi Anda untuk periode ini tidak ditemukan.
          </p>
          <SummaryView
            v-else-if="displayedUsers.length > 0 || isDataLoading"
            :users="displayedUsers"
            :start-date="filterValues.startDate"
            :end-date="filterValues.endDate"
            :year="currentYear"
            :month="currentMonth"
            :global-info="summary"
            :loading="isDataLoading"
            :mobile-layout="mobileLayout"
          />
          <p v-else class="text-center text-text/60 py-10">
            Pilih tanggal untuk menampilkan data, atau tidak ada data yang cocok dengan filter.
          </p>
        </div>

        <div v-else-if="activeTab === 'statistik'" key="statistik">
          <AttendanceStats
            :users="displayedUsers"
            :summary-info="summary || {}"
            :start-date="filterValues.startDate"
            :end-date="filterValues.endDate"
            :year="currentYear"
            :month="currentMonth"
            :loading="isDataLoading"
            :mobile-layout="mobileLayout"
          />
        </div>

        <div v-else-if="activeTab === 'detail'" key="detail">
          <p v-if="dataNotFoundForCurrentUser" class="text-center text-text/60 py-10">
            Data absensi Anda untuk periode ini tidak ditemukan.
          </p>
          <DetailView
            v-else-if="displayedUsers.length > 0"
            :user="filterValues.name.length === 1 ? displayedUsers[0] : !canViewAll ? displayedUsers[0] : null"
            :users="
              filterValues.name.length > 1
                ? displayedUsers
                : canViewAll && filterValues.name.length === 0
                  ? users
                  : !canViewAll
                    ? displayedUsers
                    : null
            "
            :start-date="filterValues.startDate"
            :end-date="filterValues.endDate"
            :year="currentYear"
            :month="currentMonth"
            :loading="isDataLoading"
            @refresh="handleRefresh"
            :mobile-layout="mobileLayout"
          />
          <p v-else class="text-center text-text/60 py-10">Belum ada log detail.</p>
        </div>

        <div v-else-if="activeTab === 'upload' && canViewAll" key="upload">
          <AttendanceUploadTab @switch-tab="activeTab = $event" />
        </div>
      </KeepAlive>
    </div>
  </main>

  <!-- MODAL PENGECUALIAN ABSEN -->
  <AttendanceExclusionsModal
    :is-open="isExclusionsModalOpen"
    @close="isExclusionsModalOpen = false"
    @updated="handleRefresh"
  />
</template>
