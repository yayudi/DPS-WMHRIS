<script setup lang="ts">
import { ref, watch, computed } from 'vue'

import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseTabs from '@/core/presentation/components/ui/BaseTabs.vue'
import ImportJobHistory from '@/core/presentation/components/shared/ImportJobHistory.vue'
import JobHistoryTable, { type JobItem } from '@/core/presentation/components/ui/JobHistoryTable.vue'
import TriStateSelect from '@/core/presentation/components/ui/TriStateSelect.vue'
import { useDownloadStore } from '@/core/presentation/stores/downloadStore'

const downloadStore = useDownloadStore()

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    isExporting?: boolean
    isImporting?: boolean
    entityType?: 'product' | 'package'
    title?: string
    exportJobType?: string
    importJobType?: string
    showColumnsSelector?: boolean
  }>(),
  {
    isExporting: false,
    isImporting: false,
    entityType: 'product'
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'export', payload: any): void
  (e: 'import', payload: FormData): void
}>()

// Dynamic Titles & Job Types
const modalTitle = computed(
  () => props.title || (props.entityType === 'package' ? 'Batch Edit Paket' : 'Batch Edit Produk')
)

const effectiveExportJobType = computed(
  () => props.exportJobType || (props.entityType === 'package' ? 'EXPORT_PACKAGES' : 'PRODUCT_MASTER')
)

const effectiveImportJobType = computed(
  () => props.importJobType || (props.entityType === 'package' ? 'IMPORT_PACKAGES' : 'IMPORT_PRODUCT')
)

const shouldShowColumns = computed(() =>
  props.showColumnsSelector !== undefined ? props.showColumnsSelector : props.entityType !== 'package'
)

// Tabs
const activeTab = ref('export')
const tabOptions = [
  { value: 'export', label: '1. Download', icon: 'fa-solid fa-download' },
  { value: 'import', label: '2. Upload', icon: 'fa-solid fa-upload' },
  { value: 'logs', label: '3. Riwayat & Log', icon: 'fa-solid fa-history' }
]

const exportFormat = ref('xlsx')
const includeImages = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const isDryRun = ref(false)

// --- Export Columns Logic ---
const availableColumns = [
  { key: 'name', label: 'Nama Produk' },
  { key: 'category_id', label: 'Kategori' },
  { key: 'price', label: 'Harga (Rp)' },
  { key: 'is_package', label: 'Tipe Paket' },
  { key: 'weight', label: 'Berat (gram)' },
  { key: 'length', label: 'Panjang (cm)' },
  { key: 'width', label: 'Lebar (cm)' },
  { key: 'height', label: 'Tinggi (cm)' },
  { key: 'is_active', label: 'Status Aktif' }
]

const selectedColumnsState = ref({
  include: availableColumns.map(c => c.key),
  exclude: [] as string[]
})

// --- Export Jobs Logic ---
const exportJobs = computed<JobItem[]>(() => {
  return (downloadStore.jobs as JobItem[]).filter(job => job.type === effectiveExportJobType.value).slice(0, 5)
})
const loadingExports = ref(false)

watch(
  () => props.isOpen,
  newVal => {
    if (newVal) {
      if (downloadStore.jobs.length === 0) {
        loadingExports.value = true
        downloadStore.fetchJobs().finally(() => {
          loadingExports.value = false
        })
      }
    }
  }
)

// Actions
const handleExport = () => {
  if (props.entityType === 'package') {
    emit('export', { format: exportFormat.value })
  } else {
    const finalColumns = ['sku', ...selectedColumnsState.value.include]
    emit('export', {
      format: exportFormat.value,
      includeImages: includeImages.value,
      columns: finalColumns
    })
  }
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) selectedFile.value = file
}

const handleDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0]
  if (file) selectedFile.value = file
}

const handleImport = () => {
  if (!selectedFile.value) return
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('dryRun', String(isDryRun.value))
  emit('import', formData)

  // Clear file input to prevent double upload
  selectedFile.value = null
  if (fileInput.value) fileInput.value.value = ''
}

const close = () => {
  emit('close')
  selectedFile.value = null
  activeTab.value = 'export'
}
</script>

<template>
  <BaseModal :show="isOpen" @close="close" :title="modalTitle" maxWidth="max-w-4xl">
    <div class="flex flex-col h-[750px] md:h-[650px]">
      <!-- TABS -->
      <div class="mb-6 shrink-0 mt-2">
        <BaseTabs :tabs="tabOptions" v-model="activeTab" class="w-full shadow-sm" />
      </div>

      <!-- MAIN CONTENT AREA -->
      <div class="flex-1 overflow-hidden flex flex-col">
        <!-- STEP 1: EXPORT -->
        <div v-if="activeTab === 'export'" class="flex-1 flex flex-col h-full overflow-hidden">
          <p class="text-sm text-text/70 mb-4 shrink-0 font-medium">
            Download data terbaru untuk diedit. Pilih format Excel untuk kemudahan atau CSV untuk kompatibilitas.
          </p>

          <div class="grid grid-cols-2 gap-4 mb-6 shrink-0">
            <label
              class="flex items-center gap-4 p-4 border-2 rounded-2xl cursor-pointer transition-all hover:bg-success/5 hover:border-success/50"
              :class="
                exportFormat === 'xlsx' ? 'border-success bg-success/5 shadow-sm' : 'border-secondary/20 bg-background'
              "
            >
              <input type="radio" v-model="exportFormat" value="xlsx" class="hidden" />
              <div class="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                <font-awesome-icon icon="fa-solid fa-file-excel" class="text-2xl text-success" />
              </div>
              <div>
                <div class="font-bold text-text text-sm">Excel (.xlsx)</div>
                <div class="text-[11px] text-text/50 font-medium mt-0.5">Direkomendasikan</div>
              </div>
            </label>

            <label
              class="flex items-center gap-4 p-4 border-2 rounded-2xl cursor-pointer transition-all hover:bg-primary/5 hover:border-primary/50"
              :class="
                exportFormat === 'csv' ? 'border-primary bg-primary/5 shadow-sm' : 'border-secondary/20 bg-background'
              "
            >
              <input type="radio" v-model="exportFormat" value="csv" class="hidden" />
              <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <font-awesome-icon icon="fa-solid fa-file-csv" class="text-2xl text-primary" />
              </div>
              <div>
                <div class="font-bold text-text text-sm">CSV (.csv)</div>
                <div class="text-[11px] text-text/50 font-medium mt-0.5">Universal</div>
              </div>
            </label>
          </div>

          <div
            v-if="shouldShowColumns"
            class="mb-4 flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20 shrink-0"
          >
            <div>
              <div class="font-semibold text-text text-sm">Sertakan Tautan (Link) Gambar</div>
              <div class="text-[12px] text-text/60 font-medium">
                Tambahkan kolom berisi tautan menuju gambar utama produk
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer shrink-0">
              <input type="checkbox" v-model="includeImages" class="sr-only peer" />
              <div
                class="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-secondary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary after:border-primary after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-secondary"
              ></div>
            </label>
          </div>

          <!-- COLUMN SELECTION -->
          <div v-if="shouldShowColumns" class="mb-6 shrink-0 bg-background border border-secondary/20 rounded-xl p-4">
            <h6 class="font-bold text-sm text-text mb-2 flex items-center gap-2">
              Kolom yang Diexport
              <span class="text-[11px] font-normal text-text/50 bg-secondary/10 px-2 py-0.5 rounded"
                >*SKU selalu disertakan secara default</span
              >
            </h6>
            <TriStateSelect
              v-model="selectedColumnsState"
              :options="availableColumns"
              label="label"
              trackBy="key"
              placeholder="Pilih kolom yang akan di-export..."
              :searchable="false"
            />
          </div>

          <!-- LIST EXPORT JOBS -->
          <div
            class="flex-1 overflow-y-auto custom-scrollbar mb-6 scrollbar-thin border-2 border-secondary/10 rounded-2xl p-4 bg-secondary/5 flex flex-col"
          >
            <h5 class="font-bold text-sm mb-4 text-text flex items-center gap-2 shrink-0">
              <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-primary" />
              Riwayat Ekspor (File Siap Diunduh)
            </h5>

            <JobHistoryTable
              :jobs="exportJobs"
              :loading="loadingExports"
              empty-text="Belum ada file ekspor terbaru."
              layout="list"
            />
          </div>

          <div class="mt-auto shrink-0">
            <button
              @click="handleExport"
              :disabled="isExporting"
              class="w-full px-5 py-4 bg-primary text-secondary rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition-all flex justify-center items-center gap-2 text-[15px]"
            >
              <font-awesome-icon v-if="isExporting" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-file-export" />
              <span>{{ isExporting ? 'Sedang Memproses...' : 'Buat Permintaan Ekspor Baru' }}</span>
            </button>
            <p class="text-xs text-center mt-3.5 text-text/50 font-medium">
              Sistem akan memproses file di latar belakang. Anda dapat memantau statusnya di kotak riwayat di atas.
            </p>
          </div>
        </div>

        <!-- STEP 2: IMPORT -->
        <div v-if="activeTab === 'import'" class="flex-1 flex flex-col h-full overflow-hidden">
          <p class="text-sm text-text/70 mb-4 shrink-0 font-medium">
            Upload file master {{ entityType === 'package' ? 'paket' : 'produk' }} yang sudah Anda edit. Sistem akan
            memproses pembaruan secara massal.
          </p>

          <div
            class="flex-1 border-2 border-dashed border-secondary/40 rounded-3xl flex flex-col items-center justify-center py-4 px-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group relative mb-6"
            @click="fileInput?.click()"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <input type="file" ref="fileInput" class="hidden" accept=".xlsx, .csv" @change="handleFileSelect" />

            <div
              class="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:bg-primary/10 transition-all text-text/40 group-hover:text-primary"
            >
              <font-awesome-icon icon="fa-solid fa-cloud-arrow-up" class="text-2xl" />
            </div>

            <h4 class="font-bold text-base text-text mb-1">
              {{ selectedFile ? selectedFile.name : 'Pilih file atau tarik ke sini' }}
            </h4>
            <p class="text-xs text-text/50 max-w-sm mb-3">
              Mendukung format .XLSX dan .CSV. Pastikan kolom SKU sesuai dengan data master produk.
            </p>

            <div
              v-if="selectedFile"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-semibold"
            >
              <font-awesome-icon icon="fa-solid fa-check" />
              <span>File Terpilih ({{ (selectedFile.size / 1024).toFixed(1) }} KB)</span>
            </div>
          </div>

          <div
            class="mb-6 flex items-center justify-between p-4 bg-secondary/5 rounded-2xl border border-secondary/20 shrink-0"
          >
            <div>
              <div class="font-bold text-text text-sm">Mode Simulasi (Dry Run)</div>
              <div class="text-xs text-text/50 mt-0.5">
                Cek validasi data dan format tanpa menyimpan perubahan ke database
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" v-model="isDryRun" class="sr-only peer" />
              <div
                class="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-secondary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary after:border-primary after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-secondary"
              ></div>
            </label>
          </div>

          <div class="mt-auto shrink-0">
            <button
              @click="handleImport"
              :disabled="!selectedFile || isImporting"
              class="w-full px-5 py-4 bg-primary text-secondary rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition-all flex justify-center items-center gap-2 text-[15px]"
            >
              <font-awesome-icon v-if="isImporting" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-cloud-arrow-up" />
              <span>{{ isImporting ? 'Mengupload File...' : 'Mulai Proses Import' }}</span>
            </button>
            <p class="text-xs text-center mt-3.5 text-text/50 font-medium">
              Data akan diimpor melalui antrean latar belakang untuk menghindari waktu tunggu browser.
            </p>
          </div>
        </div>

        <!-- STEP 3: LOGS -->
        <div v-if="activeTab === 'logs'" class="flex-1 flex flex-col h-full overflow-hidden">
          <ImportJobHistory :job-type="effectiveImportJobType" />
        </div>
      </div>
    </div>
  </BaseModal>
</template>
