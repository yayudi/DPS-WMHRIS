<!-- frontend\src\views\WMSBatchLogView.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { fetchBatchLogs, fetchMovementTypes, requestBatchLogExport } from '@/api/helpers/stock.js'
import { useMasterDataStore } from '@/stores/masterData'
import { useDownloadStore } from '@/stores/downloadStore.js'
import { useToast } from '@/composables/useToast.js'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import DateRangeFilter from '@/components/ui/DateRangeFilter.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useMobile } from '@/composables/useMobile.js'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { usePagination } from '@/composables/usePagination.js'
import { generateDynamicExportName } from '@/utils/formatters.js'
import ExportDropdown from '@/components/ui/ExportDropdown.vue'

const masterData = useMasterDataStore()
const downloadStore = useDownloadStore()
const { isMobile } = useMobile()
const { toast } = useToast()

// State Filter
const startDate = ref('')
const endDate = ref('')
const searchProduct = ref('')
const searchType = ref({ include: [], exclude: [] })
const searchSourceLocation = ref({ include: [], exclude: [] })
const searchDestinationLocation = ref({ include: [], exclude: [] })
const searchUser = ref('')
const searchNotes = ref('')

// Data & UI
const logs = ref([])
const locations = ref([])
const loading = ref(false)
const exportLoading = ref(false)
const hasSearched = ref(false)

const totalLogs = ref(0)

const {
  currentPage,
  currentLimit,
  meta: pagination,
  changePage: onChangePage,
  changePageSize: onChangeLimit
} = usePagination({
  totalItems: totalLogs,
  initialLimit: 50,
  storageKey: 'batchLogsLimit',
  onPageChange: () => handleSearch()
})

// Options
const movementTypeOptions = ref([])

const locationOptions = computed(() => locations.value.map(loc => ({ id: loc.id, label: loc.code })))

onMounted(async () => {
  // Set Default Date: Hari Ini
  const today = new Date().toISOString().split('T')[0]
  startDate.value = today
  endDate.value = today

  // Load Locations untuk Dropdown
  try {
    locations.value = await masterData.getLocations()
  } catch (e) {
    console.error('Gagal load lokasi', e)
  }

  // Load Dynamic Movement Types
  try {
    const types = await fetchMovementTypes()
    movementTypeOptions.value = types.map(t => ({ id: t, label: t }))
  } catch (e) {
    console.error('Gagal load tipe pergerakan', e)
  }

  // Auto load hari ini
  handleSearch()
})

async function handleSearch() {
  if (!startDate.value || !endDate.value) {
    toast('Silakan pilih tanggal mulai dan selesai.', 'warning')
    return
  }

  loading.value = true
  hasSearched.value = true

  try {
    const filters = {
      productName: searchProduct.value,
      movementType: JSON.stringify(searchType.value),
      sourceLocation: JSON.stringify(searchSourceLocation.value),
      destinationLocation: JSON.stringify(searchDestinationLocation.value),
      user: searchUser.value,
      notes: searchNotes.value
    }

    const res = await fetchBatchLogs(startDate.value, endDate.value, filters, currentPage.value, currentLimit.value)
    logs.value = res.data || []
    if (res.pagination) {
      totalLogs.value = res.pagination.total
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    toast(`Gagal memuat data log: ${error.message || 'Terjadi kesalahan'}`, 'error')
  } finally {
    loading.value = false
  }
}

// onChangePage and onChangeLimit are provided by usePagination

function handleReset() {
  const today = new Date().toISOString().split('T')[0]
  startDate.value = today
  endDate.value = today

  searchProduct.value = ''
  searchType.value = { include: [], exclude: [] }
  searchSourceLocation.value = { include: [], exclude: [] }
  searchDestinationLocation.value = { include: [], exclude: [] }
  searchUser.value = ''
  searchNotes.value = ''

  logs.value = []
  hasSearched.value = false
  currentPage.value = 1

  handleSearch()
}

async function handleExport() {
  if (!startDate.value || !endDate.value) {
    toast('Silakan pilih tanggal mulai dan selesai.', 'warning')
    return
  }

  try {
    exportLoading.value = true
    const parts = [
      startDate.value && endDate.value ? `${startDate.value}_to_${endDate.value}` : null,
      searchProduct.value ? searchProduct.value.substring(0, 15) : null,
      searchType.value.include?.join('_')
    ]
    const exportName = generateDynamicExportName('batch_log', parts)

    const filters = {
      productName: searchProduct.value,
      movementType: JSON.stringify(searchType.value),
      sourceLocation: JSON.stringify(searchSourceLocation.value),
      destinationLocation: JSON.stringify(searchDestinationLocation.value),
      user: searchUser.value,
      notes: searchNotes.value,
      format: 'xlsx',
      exportName: exportName
    }

    await requestBatchLogExport(startDate.value, endDate.value, filters)
    downloadStore.notifyNewJob()
    toast('Permintaan ekspor berhasil! Proses berjalan di latar belakang.', 'success')
  } catch (error) {
    console.error(error)
    toast(`Gagal meminta ekspor: ${error.message || 'Terjadi kesalahan'}`, 'error')
  } finally {
    exportLoading.value = false
  }
}
</script>

<template>
  <div class="animate-fade-in text-text">
    <!-- Filter Section -->
    <BaseFilterPanel class="mb-6">
      <template #filters>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:flex xl:flex-row lg:justify-between items-end gap-1">
          <!-- Product Name -->
          <div class="space-y-1.5 w-full lg:w-[30%]">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">Produk / SKU</label>
            <div class="relative group">
              <font-awesome-icon
                icon="fa-solid fa-search"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 group-focus-within:text-primary transition-colors text-sm"
              />
              <input
                v-model="searchProduct"
                type="text"
                placeholder="Cari nama/kode..."
                class="w-full h-[42px] pl-9 pr-3 bg-background border border-secondary rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text/30"
                @keyup.enter="
                  () => {
                    pagination.page = 1
                    handleSearch()
                  }
                "
              />
            </div>
          </div>

          <!-- Movement Type -->
          <div class="space-y-1.5 w-full lg:w-[125px]">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">Tipe</label>
            <TriStateSelect
              v-model="searchType"
              :options="movementTypeOptions"
              label="label"
              track="id"
              placeholder="Semua Tipe"
            />
          </div>

          <!-- Source Location -->
          <div class="space-y-1.5 w-full lg:w-[150px]">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">Lokasi Sumber</label>
            <TriStateSelect
              v-model="searchSourceLocation"
              :options="locationOptions"
              label="label"
              track="id"
              placeholder="Semua Sumber"
            />
          </div>

          <!-- Destination Location -->
          <div class="space-y-1.5 w-full lg:w-[150px]">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">Destinasi</label>
            <TriStateSelect
              v-model="searchDestinationLocation"
              :options="locationOptions"
              label="label"
              track="id"
              placeholder="Semua Destinasi"
            />
          </div>

          <!-- User -->
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">User</label>
            <div class="relative group">
              <font-awesome-icon
                icon="fa-solid fa-user"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 group-focus-within:text-primary transition-colors text-sm"
              />
              <input
                v-model="searchUser"
                type="text"
                placeholder="Cari user..."
                class="w-full h-[42px] pl-9 pr-3 bg-background border border-secondary rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text/30"
                @keyup.enter="
                  () => {
                    pagination.page = 1
                    handleSearch()
                  }
                "
              />
            </div>
          </div>

          <!-- Notes -->
          <div class="space-y-1.5 w-full lg:w-[25%]">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">Notes</label>
            <div class="relative group">
              <font-awesome-icon
                icon="fa-solid fa-note-sticky"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40 group-focus-within:text-primary transition-colors text-sm"
              />
              <input
                v-model="searchNotes"
                type="text"
                placeholder="Cari catatan..."
                class="w-full h-[42px] pl-9 pr-3 bg-background border border-secondary rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all placeholder:text-text/30"
                @keyup.enter="
                  () => {
                    pagination.page = 1
                    handleSearch()
                  }
                "
              />
            </div>
          </div>

          <!-- Date Filter -->
          <div class="space-y-1.5">
            <label class="text-xs font-bold text-text/60 uppercase tracking-wide">Rentang Waktu</label>
            <DateRangeFilter v-model:startDate="startDate" v-model:endDate="endDate" class="w-full" />
          </div>

          <!-- Actions -->
          <div class="flex gap-1 mt-4 lg:mt-0">
            <ExportDropdown
              @select="handleExport"
              :loading="exportLoading"
              :options="[{ key: 'xlsx', label: 'Excel (.xlsx)', icon: 'fa-file-excel', iconClass: 'text-success' }]"
              class="flex-1 xl:flex-none"
              buttonClass="w-full h-[42px] inline-flex items-center justify-center rounded-md bg-success/5 px-4 py-2 text-sm font-semibold text-success shadow-sm ring-1 ring-inset ring-success/30 hover:bg-success/10 transition-color"
            />
            <button
              @click="handleReset"
              class="h-[42px] px-4 flex items-center justify-center gap-2 border border-danger/30 rounded-lg text-sm font-semibold text-danger hover:bg-danger/10 transition-all bg-danger/5 active:scale-[0.98] flex-1 xl:flex-none"
            >
              <font-awesome-icon icon="fa-solid fa-rotate-right" />
              <span class="hidden xl:inline">Reset</span>
            </button>
            <button
              @click="
                () => {
                  pagination.page = 1
                  handleSearch()
                }
              "
              :disabled="loading"
              class="h-[42px] px-6 bg-primary text-secondary rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 transition-all flex items-center justify-center gap-2 flex-[2] xl:flex-1"
            >
              <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" spin />
              <span>{{ loading ? '...' : 'Cari' }}</span>
            </button>
          </div>
        </div>
      </template>
    </BaseFilterPanel>

    <!-- Hasil Log -->
    <div class="bg-background rounded-xl shadow-md border border-secondary/20 overflow-hidden">
      <div class="max-h-[70vh] overflow-y-auto">
        <div v-if="loading" class="text-center p-12">
          <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-3xl mb-3" />
          <p class="text-text/50">Mengambil data...</p>
        </div>

        <div v-else-if="logs.length === 0 && hasSearched" class="text-center p-12">
          <div class="bg-secondary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
            <font-awesome-icon icon="fa-solid fa-box-open" class="text-2xl text-text/40" />
          </div>
          <p class="text-text font-medium">Tidak ada data ditemukan.</p>
          <p class="text-text/50 text-sm">Coba sesuaikan filter pencarian.</p>
        </div>

        <table v-else class="custom-scrollbar text-xs" :class="isMobile ? 'w-full block' : 'min-w-full'">
          <thead
            class="bg-secondary uppercase text-text/70 backdrop-blur-sm z-10"
            :class="isMobile ? 'hidden' : 'sticky top-0'"
          >
            <tr>
              <th class="p-3 text-left font-bold border-b border-secondary/20">Waktu</th>
              <th class="p-3 text-left font-bold border-b border-secondary/20">Produk</th>
              <th class="p-3 text-center font-bold border-b border-secondary/20">Qty</th>
              <th class="p-3 text-left font-bold border-b border-secondary/20">Tipe</th>
              <th class="p-3 text-left font-bold border-b border-secondary/20">Route</th>
              <th class="p-3 text-left font-bold border-b border-secondary/20">User</th>
              <th class="p-3 text-left font-bold border-b border-secondary/20">Notes</th>
            </tr>
          </thead>
          <tbody :class="isMobile ? 'block' : 'divide-y divide-secondary/10'">
            <tr
              v-for="log in logs"
              :key="log.id"
              class="transition-colors"
              :class="
                isMobile
                  ? 'block mb-4 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                  : 'hover:bg-primary/5'
              "
            >
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'p-3 whitespace-nowrap align-top text-text/80'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Waktu</span>
                <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                  <div class="font-medium">
                    {{ new Date(log.created_at || log.createdAt).toLocaleDateString('id-ID') }}
                  </div>
                  <div class="text-[10px] opacity-60">
                    {{ new Date(log.created_at || log.createdAt).toLocaleTimeString('id-ID') }}
                  </div>
                </div>
              </td>
              <td
                :class="
                  isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'p-3 align-top'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Produk</span>
                <div :class="isMobile ? 'text-right' : ''">
                  <div class="font-bold text-primary">{{ log.product_name }}</div>
                  <div class="font-mono text-[10px] text-text/50 bg-secondary/10 inline-block px-1 rounded">
                    {{ log.sku }}
                  </div>
                </div>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'p-3 text-center align-top'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Qty</span>
                <span class="font-bold text-sm" :class="log.quantity > 0 ? 'text-text' : 'text-accent'">
                  {{ log.quantity }}
                </span>
              </td>
              <td
                :class="
                  isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'p-3 align-top'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Tipe</span>
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  :class="{
                    'bg-primary/10 text-primary': log.movement_type === 'TRANSFER',
                    'bg-success/10 text-success': log.movement_type === 'INBOUND' || log.movement_type === 'RETURN',
                    'bg-warning/10 text-warning': log.movement_type === 'ADJUSTMENT' || log.movement_type === 'OPNAME'
                  }"
                >
                  {{ log.movement_type }}
                </span>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10 text-text/80'
                    : 'p-3 align-top text-text/80 min-w-[150px]'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Route</span>
                <div :class="isMobile ? 'flex flex-col items-end gap-1.5' : 'flex flex-col gap-1.5'">
                  <!-- Jika ada keduanya dan berbeda (Transfer) -->
                  <div
                    v-if="log.from_location && log.to_location && log.from_location !== log.to_location"
                    class="flex items-center gap-1.5 flex-wrap"
                    :class="isMobile ? 'justify-end' : ''"
                  >
                    <span
                      class="px-1.5 py-0.5 rounded border border-secondary/20 bg-secondary/10 text-text/80 font-mono text-[10px] shadow-sm flex items-center gap-1"
                    >
                      <font-awesome-icon icon="fa-solid fa-upload" class="text-[9px] opacity-50" />
                      {{ log.from_location }}
                    </span>
                    <font-awesome-icon icon="fa-solid fa-arrow-right" class="text-text/30 text-[10px]" />
                    <span
                      class="px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary font-mono font-bold text-[10px] shadow-sm flex items-center gap-1"
                    >
                      <font-awesome-icon icon="fa-solid fa-download" class="text-[9px] opacity-70" />
                      {{ log.to_location }}
                    </span>
                  </div>

                  <!-- Jika hanya From Location (Outbound/Picking/Adjustment min) -->
                  <div
                    v-else-if="log.from_location && (!log.to_location || log.from_location === log.to_location)"
                    class="flex items-center gap-1.5"
                    :class="isMobile ? 'justify-end' : ''"
                  >
                    <span
                      class="px-1.5 py-0.5 rounded border border-warning/30 bg-warning/10 text-warning-dark font-mono text-[10px] shadow-sm flex items-center gap-1"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrow-up-right-from-square" class="text-[10px]" />
                      {{ log.from_location }}
                    </span>
                  </div>

                  <!-- Jika hanya To Location (Inbound/Return/Adjustment plus) -->
                  <div
                    v-else-if="log.to_location && !log.from_location"
                    class="flex items-center gap-1.5"
                    :class="isMobile ? 'justify-end' : ''"
                  >
                    <span
                      class="px-1.5 py-0.5 rounded border border-success/30 bg-success/10 text-success-dark font-mono font-bold text-[10px] shadow-sm flex items-center gap-1"
                    >
                      <font-awesome-icon icon="fa-solid fa-arrow-right-to-bracket" class="text-[10px]" />
                      {{ log.to_location }}
                    </span>
                  </div>

                  <div v-else class="text-text/30 text-[10px] italic">N/A</div>
                </div>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'p-3 align-top text-text/80'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">User</span>
                <span class="text-text/80">{{ log.user }}</span>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2'
                    : 'p-3 align-top text-text/60 italic max-w-[200px] truncate'
                "
                :title="log.notes"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Notes</span>
                <span class="text-text/60 italic">{{ log.notes || '-' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <BasePagination
        v-if="logs.length > 0"
        :pagination="pagination"
        :limit-options="[10, 20, 50, 100]"
        @changePage="onChangePage"
        @update:limit="onChangeLimit"
      />
    </div>
  </div>
</template>
