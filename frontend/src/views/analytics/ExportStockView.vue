<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { generateDynamicExportName, formatFileName } from '@/utils/formatters.js'
import { requestExportStock, getUserExportJobs } from '@/api/helpers/stats.js'
import { useMasterDataStore } from '@/stores/masterData'
import { useToast } from '@/composables/useToast.js'
import SearchInput from '@/components/ui/SearchInput.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import { useDownloadStore } from '@/stores/downloadStore.js'
import { useDownload } from '@/composables/useDownload.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'

const { openDownloadUrl } = useDownload()
const masterData = useMasterDataStore()
const downloadStore = useDownloadStore()
const { toast } = useToast()

const isRequesting = ref(false)
const jobHistory = ref([])
const isHistoryLoading = ref(false)

const selectedFilters = ref({
  searchQuery: '',
  building: { include: [], exclude: [] },
  purpose: { include: [], exclude: [] },
  isPackage: 'all',
  stockStatus: 'all',
  format: 'xlsx'
})
const reportFilters = ref({
  allBuildings: [],
  purposes: [],
  buildingsByPurpose: {}
})

async function loadReportFilters() {
  try {
    const response = await masterData.getReportFilters()
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
      jobHistory.value = response.data.filter(job => job.type === 'STOCK_REPORT')
    }
  } catch (error) {
    console.error('Gagal memuat riwayat:', error)
  } finally {
    isHistoryLoading.value = false
  }
}

onMounted(() => {
  loadReportFilters()
  loadHistory()
})

useFirebaseSync(
  ['BACKGROUND_JOBS'],
  ['EXPORT_COMPLETED', 'EXPORT_FAILED', 'EXPORT_STARTED'],
  () => {
    loadHistory()
  }
)

const purposeOptions = computed(() => {
  return (reportFilters.value?.purposes || []).map(p => ({ value: p, label: p }))
})

const typeOptions = [
  { value: 'all', label: 'Semua', icon: 'fa-solid fa-layer-group' },
  { value: '0', label: 'Tunggal', icon: 'fa-solid fa-box' },
  { value: '1', label: 'Paket', icon: 'fa-solid fa-box-open' }
]

const stockStatusOptions = [
  { value: 'all', label: 'Semua', icon: 'fa-solid fa-boxes-stacked' },
  { value: 'positive', label: 'Positif', icon: 'fa-solid fa-plus' },
  { value: 'negative', label: 'Minus', icon: 'fa-solid fa-minus' }
]

const formatOptions = [
  { value: 'xlsx', label: 'Excel (.xlsx)', icon: 'fa-solid fa-file-excel' },
  { value: 'csv', label: 'CSV (.csv)', icon: 'fa-solid fa-file-csv' }
]

const availableBuildings = computed(() => {
  const includedPurposes = selectedFilters.value.purpose?.include || []
  if (!includedPurposes || includedPurposes.length === 0) {
    return reportFilters.value.allBuildings.map(b => ({ value: b, label: b }))
  }
  let buildings = new Set()
  includedPurposes.forEach(p => {
    const blds = reportFilters.value.buildingsByPurpose[p] || []
    blds.forEach(b => buildings.add(b))
  })
  return Array.from(buildings).map(b => ({ value: b, label: b }))
})

watch(
  () => selectedFilters.value.purpose,
  () => {
    selectedFilters.value.building = { include: [], exclude: [] }
  },
  { deep: true }
)

async function handleRequestExport() {
  const parts = [
    selectedFilters.value.searchQuery ? selectedFilters.value.searchQuery.substring(0, 15) : null,
    selectedFilters.value.purpose?.include?.join('_'),
    selectedFilters.value.building?.include?.join('_'),
    selectedFilters.value.stockStatus !== 'all' ? selectedFilters.value.stockStatus : null
  ]
  const exportName = generateDynamicExportName('stock_report', parts)

  const filters = {
    searchQuery: selectedFilters.value.searchQuery || null,
    building: selectedFilters.value.building,
    purpose: selectedFilters.value.purpose,
    isPackage: selectedFilters.value.isPackage === 'all' ? '' : selectedFilters.value.isPackage,
    stockStatus: selectedFilters.value.stockStatus || 'all',
    format: selectedFilters.value.format || 'xlsx',
    exportType: 'STOCK_REPORT',
    exportName: exportName
  }

  isRequesting.value = true
  try {
    const response = await requestExportStock(filters)
    toast(response.message || 'Permintaan diterima!', 'success')
    loadHistory()
    downloadStore.notifyNewJob()
  } catch (error) {
    console.error(error)
  } finally {
    isRequesting.value = false
  }
}

function formatJobType(type) {
  if (!type) return '-'
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
</script>

<template>
  <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 relative overflow-visible animate-fade-in">
    <div class="mb-6 border-b border-secondary pb-4">
      <h3 class="text-lg font-bold text-text">Ekspor Laporan Stok</h3>
      <p class="text-sm text-text/50 mt-1">Filter dan unduh data stok gudang dalam format Excel.</p>
    </div>

    <div class="grid lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1">
        <BaseFilterPanel title="Filter Export">
          <template #filters>
            <div class="space-y-5 w-full">
              <div>
                <label class="label-input">Cari Produk</label>
                <SearchInput
                  id="search-filter"
                  v-model="selectedFilters.searchQuery"
                  placeholder="Cari SKU atau Nama Produk..."
                />
              </div>

              <div>
                <label class="label-input">Tujuan</label>
                <TriStateSelect
                  v-model="selectedFilters.purpose"
                  :options="purposeOptions"
                  label="label"
                  track-by="value"
                  placeholder="Semua Tujuan"
                />
              </div>

              <div>
                <label class="label-input">Gedung</label>
                <TriStateSelect
                  v-model="selectedFilters.building"
                  :options="availableBuildings"
                  label="label"
                  track-by="value"
                  placeholder="Semua Gedung"
                />
              </div>

              <SegmentedControl
                label="Tipe"
                label-variant="compact"
                v-model="selectedFilters.isPackage"
                :options="typeOptions"
              />

              <SegmentedControl
                label="Status Stok"
                label-variant="compact"
                v-model="selectedFilters.stockStatus"
                :options="stockStatusOptions"
              />

              <SegmentedControl
                label="Format File"
                label-variant="compact"
                v-model="selectedFilters.format"
                :options="formatOptions"
              />

              <button
                @click="handleRequestExport"
                :disabled="isRequesting"
                class="w-full py-3 flex items-center justify-center gap-2 border border-primary/30 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 transition-all bg-primary/5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <font-awesome-icon v-if="isRequesting" icon="fa-solid fa-circle-notch" spin />
                <font-awesome-icon v-else icon="fa-solid fa-file-export" />
                <span>{{ isRequesting ? 'Memproses...' : 'Generate Laporan' }}</span>
              </button>
            </div>
          </template>
        </BaseFilterPanel>
      </div>

      <div class="lg:col-span-2">
        <div class="flex justify-between items-center mb-4">
          <h4 class="text-sm font-bold text-text/70 uppercase tracking-wide">Riwayat Generate</h4>
        </div>

        <div
          class="bg-background border border-secondary/20 rounded-xl overflow-hidden shadow-md overflow-x-auto overflow-y-auto relative custom-scrollbar max-h-[400px]"
        >
          <table class="w-full text-left text-sm min-w-[500px] border-collapse">
            <thead
              class="sticky top-0 z-50 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary"
            >
              <tr>
                <th
                  class="px-3 py-3 font-bold text-xs text-text/60 uppercase sticky left-0 z-10 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  Nama File
                </th>
                <th
                  class="px-3 py-3 font-bold text-xs text-text/60 uppercase sticky left-0 z-10 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  Waktu
                </th>
                <th
                  class="px-3 py-3 font-bold text-xs text-text/60 uppercase sticky left-0 z-10 bg-background/95 backdrop-blur-md border-b border-secondary/10 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  Tipe
                </th>
                <th class="px-3 py-3 font-bold text-xs text-text/60 uppercase border-b border-secondary/10">
                  Status
                </th>
                <th
                  class="px-3 py-3 font-bold text-xs text-text/60 uppercase text-right border-b border-secondary/10 sticky right-0 z-30 bg-background/95 backdrop-blur-md shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  Aksi
                </th>
              </tr>
            </thead>
            <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
              <template v-if="isHistoryLoading && jobHistory.length === 0">
                <tr
                  v-for="n in 3"
                  :key="`skeleton-${n}`"
                  class="border-b border-secondary/20 animate-pulse"
                >
                  <td v-for="i in 5" :key="i" class="px-6 py-4">
                    <BaseSkeleton
                      :shape="i === 5 ? 'rect' : 'text'"
                      :className="
                        i === 1 ? 'w-8 h-4 mx-auto' : i === 5 ? 'w-16 h-6 mx-auto rounded-md' : 'w-full h-4'
                      "
                    />
                  </td>
                </tr>
              </template>

              <tr v-else-if="jobHistory.length === 0" key="empty">
                <td colspan="3" class="px-6 py-12 text-sm text-text/40 text-center italic">
                  <font-awesome-icon
                    icon="fa-solid fa-clock-rotate-left"
                    class="mb-3 text-3xl opacity-20 block mx-auto"
                  />
                  Belum ada riwayat permintaan.
                </td>
              </tr>

              <tr
                v-else
                v-for="job in jobHistory"
                :key="job.id"
                class="hover:bg-secondary/5 transition-colors group relative"
              >
                <td
                  class="px-2 py-1 text-text text-xs sticky left-0 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  <div class="flex flex-col">
                    <span class="font-bold text-sm">{{ formatFileName(job.file_path, job.type) }}</span>
                  </div>
                </td>
                <td
                  class="px-2 py-1 text-text text-xs sticky left-0 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  <div class="flex flex-col">
                    <span class="font-bold text-sm">{{
                      new Date(job.created_at || job.createdAt).toLocaleDateString('id-ID')
                    }}</span>
                    <span class="text-text/40 text-[10px]">{{
                      new Date(job.created_at || job.createdAt).toLocaleTimeString('id-ID')
                    }}</span>
                  </div>
                </td>
                <td class="px-2 py-1">
                  <div class="flex flex-col">
                    <span class="font-bold text-sm">{{ formatJobType(job.type) }}</span>
                  </div>
                </td>
                <td class="px-2 py-1">
                  <span
                    v-if="job.status === 'PENDING'"
                    class="inline-flex items-center gap-1.5 justify-center align-center w-full py-1 rounded-full text-[10px] font-bold bg-warning/10 text-warning border border-warning/20"
                    title="Menunggu"
                  >
                    <font-awesome-icon icon="fa-solid fa-clock" class="animate-ping" />
                  </span>
                  <span
                    v-if="job.status === 'COMPLETED'"
                    class="inline-flex items-center gap-1.5 justify-center align-center w-full py-1 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20"
                    title="Selesai"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" />
                  </span>
                  <span
                    v-else-if="job.status === 'FAILED'"
                    class="inline-flex items-center gap-1.5 justify-center align-center w-full py-1 rounded-full text-[10px] font-bold bg-danger/10 text-danger border border-danger/20"
                    :title="job.error_message || Gagal"
                  >
                    <font-awesome-icon icon="fa-solid fa-xmark" />
                  </span>
                  <span
                    v-else-if="job.status === 'PROCESSING'"
                    class="inline-flex items-center gap-1.5 justify-center align-center w-full py-1 rounded-full text-[10px] font-bold bg-warning/10 text-warning border border-warning/20"
                    title="Proses"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                  </span>
                </td>
                <td
                  class="px-2 py-1 text-right sticky right-0 bg-background group-hover:bg-secondary/5 transition-colors shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]"
                >
                  <a
                    v-if="job.status === 'COMPLETED'"
                    href="#"
                    @click.prevent="openDownloadUrl(job.download_url)"
                    class="inline-flex items-center align-center justify-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold w-full hover:bg-primary hover:text-secondary transition-all shadow-sm"
                  >
                    <font-awesome-icon icon="fa-solid fa-download" />
                  </a>
                  <span
                    v-else-if="job.status === 'FAILED'"
                    class="text-xs text-danger/60 bg-re align-center justify-center italic cursor-help underline decoration-dotted"
                    :title="job.error_message"
                  >
                    Error
                  </span>
                  <span v-else class="text-xs text-text/30 align-center justify-center italic">
                    Menunggu...
                  </span>
                </td>
              </tr>
            </TransitionGroup>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.label-input {
  @apply block text-xs font-bold text-text/60 uppercase mb-1.5;
}

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

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
