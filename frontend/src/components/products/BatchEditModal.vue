<script setup>
import { ref, watch, computed } from 'vue'
import dayjs from 'dayjs'

import BaseModal from '@/components/ui/BaseModal.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import ImportJobHistory from '@/components/shared/ImportJobHistory.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import { useDownloadStore } from '@/stores/downloadStore.js'

const downloadStore = useDownloadStore()

const props = defineProps({
  isOpen: Boolean,
  isExporting: Boolean,
  isImporting: Boolean
})

const emit = defineEmits(['close', 'export', 'import'])

// Tabs
const activeTab = ref('export')
const tabOptions = [
  { value: 'export', label: '1. Download', icon: 'fa-solid fa-download' },
  { value: 'import', label: '2. Upload', icon: 'fa-solid fa-upload' },
  { value: 'logs', label: '3. Riwayat & Log', icon: 'fa-solid fa-history' }
]

const exportFormat = ref('xlsx')
const includeImages = ref(false)
const fileInput = ref(null)
const selectedFile = ref(null)
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
  exclude: []
})

// --- Export Jobs Logic ---
const exportJobs = computed(() => {
  return downloadStore.jobs.filter(job => job.type === 'PRODUCT_MASTER').slice(0, 5)
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

const formatStatus = status => {
  const map = {
    PENDING: 'Menunggu',
    PROCESSING: 'Memproses',
    COMPLETED: 'Selesai',
    FAILED: 'Gagal'
  }
  return map[status] || status
}

const getStatusClass = status => {
  const map = {
    PENDING: 'bg-warning/10 text-warning',
    PROCESSING: 'bg-accent/10 text-accent animate-pulse',
    COMPLETED: 'bg-success/10 text-success',
    FAILED: 'bg-danger/10 text-danger'
  }
  return map[status] || 'bg-secondary/10 text-text/60'
}

const formatDate = date => dayjs(date).format('DD MMM YYYY, HH:mm')

// Actions
const handleExport = () => {
  const finalColumns = ['sku', ...selectedColumnsState.value.include]
  emit('export', {
    format: exportFormat.value,
    includeImages: includeImages.value,
    columns: finalColumns
  })
}

const handleFileSelect = event => {
  const file = event.target.files[0]
  if (file) selectedFile.value = file
}

const handleDrop = event => {
  const file = event.dataTransfer.files[0]
  if (file) selectedFile.value = file
}

const handleImport = () => {
  if (!selectedFile.value) return
  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('dryRun', isDryRun.value)
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
  <BaseModal :show="isOpen" @close="close" title="Batch Edit Produk" maxWidth="max-w-4xl">
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
          <div class="mb-6 shrink-0 bg-background border border-secondary/20 rounded-xl p-4">
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

            <div
              v-if="loadingExports && exportJobs.length === 0"
              class="flex-1 flex flex-col items-center justify-center text-text/40"
            >
              <font-awesome-icon icon="fa-solid fa-circle-notch" spin size="2x" />
              <p class="mt-3 text-xs font-medium">Memuat riwayat...</p>
            </div>

            <div v-else-if="exportJobs.length === 0" class="flex-1 flex flex-col items-center justify-center">
              <div class="w-16 h-16 bg-secondary/20 rounded-full flex items-center justify-center mb-3">
                <font-awesome-icon icon="fa-solid fa-folder-open" class="text-2xl text-text/30" />
              </div>
              <p class="text-sm text-text/60 font-medium">Belum ada file ekspor terbaru.</p>
            </div>

            <div v-else class="space-y-3 shrink-0">
              <div
                v-for="job in exportJobs"
                :key="job.id"
                class="flex items-center justify-between p-3.5 border border-secondary/20 rounded-xl bg-background hover:border-primary/30 transition-colors shadow-sm group"
              >
                <div>
                  <div class="flex items-center gap-2.5 mb-1.5">
                    <span
                      class="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-widest"
                      :class="getStatusClass(job.status)"
                    >
                      {{ formatStatus(job.status) }}
                    </span>
                    <span class="text-xs text-text/50 font-medium flex items-center gap-1">
                      <font-awesome-icon icon="fa-regular fa-clock" />
                      {{ formatDate(job.created_at) }}
                    </span>
                  </div>
                  <p v-if="job.status === 'FAILED'" class="text-xs text-danger font-bold flex items-center gap-1">
                    <font-awesome-icon icon="fa-solid fa-circle-exclamation" />
                    {{ job.error_message || 'Gagal mengekspor data' }}
                  </p>
                  <p v-else class="text-xs text-text/80 font-bold flex items-center gap-1.5">
                    <font-awesome-icon icon="fa-solid fa-file-lines" class="text-text/40" />
                    Data Master Produk ({{
                      job.filters ? (JSON.parse(job.filters).format || 'xlsx').toUpperCase() : 'XLSX'
                    }})
                  </p>
                </div>

                <a
                  v-if="job.status === 'COMPLETED' && job.download_url"
                  :href="job.download_url"
                  target="_blank"
                  class="shrink-0 px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-secondary rounded-xl text-sm font-bold transition-all flex items-center gap-2 border border-transparent hover:shadow-md hover:-translate-y-0.5"
                >
                  <font-awesome-icon icon="fa-solid fa-download" /> Unduh
                </a>
                <div
                  v-else-if="job.status === 'PROCESSING' || job.status === 'PENDING'"
                  class="shrink-0 px-4 py-2 text-text/40 flex items-center gap-2"
                >
                  <font-awesome-icon icon="fa-solid fa-circle-notch" spin />
                </div>
              </div>
            </div>
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
            Upload file master produk yang sudah Anda edit. Sistem akan memproses pembaruan secara massal.
          </p>

          <div
            class="flex-1 border-2 border-dashed border-secondary/40 rounded-3xl flex flex-col items-center justify-center py-4 px-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group relative mb-6"
            @click="$refs.fileInput.click()"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <input type="file" ref="fileInput" class="hidden" accept=".csv, .xlsx, .xls" @change="handleFileSelect" />

            <div v-if="selectedFile" class="z-10 flex flex-col items-center">
              <div
                class="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-5 text-success shadow-inner"
              >
                <font-awesome-icon icon="fa-solid fa-file-circle-check" class="text-4xl" />
              </div>
              <p class="font-bold text-lg text-text max-w-[250px] truncate">
                {{ selectedFile.name }}
              </p>
              <p class="text-sm text-text/50 mt-1 font-medium">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
              <div
                class="mt-6 px-5 py-2 bg-background rounded-full text-xs font-bold text-text/70 border border-secondary/20 shadow-sm group-hover:text-primary group-hover:border-primary/30 transition-colors"
              >
                Klik untuk mengganti file
              </div>
            </div>

            <div v-else class="z-10 flex flex-col items-center">
              <div
                class="w-24 h-24 bg-secondary/10 rounded-full flex items-center justify-center mb-5 text-text/30 group-hover:bg-primary/10 group-hover:text-primary transition-all duration-300"
              >
                <font-awesome-icon
                  icon="fa-solid fa-cloud-arrow-up"
                  class="text-5xl group-hover:-translate-y-1 transition-transform"
                />
              </div>
              <p class="font-bold text-text text-lg mb-1.5">Pilih File atau Drag & Drop</p>
              <p class="text-sm text-text/50 font-medium">Mendukung file format .xlsx, .xls, dan .csv</p>
            </div>
          </div>

          <!-- Dry Run Option -->
          <label
            class="shrink-0 mb-6 bg-warning/5 border border-warning/20 rounded-2xl p-4 flex items-start gap-4 cursor-pointer hover:bg-warning/10 transition-colors"
          >
            <div class="pt-0.5">
              <div
                class="relative flex items-center justify-center w-5 h-5 border-2 rounded-md border-warning bg-background transition-colors"
                :class="isDryRun ? 'bg-warning border-warning' : ''"
              >
                <input type="checkbox" v-model="isDryRun" class="hidden" />
                <font-awesome-icon v-if="isDryRun" icon="fa-solid fa-check" class="text-xs text-white" />
              </div>
            </div>
            <div class="flex-1">
              <h6 class="font-bold text-sm text-text">Test Import (Dry Run)</h6>
              <p class="text-xs text-text/70 mt-1.5 leading-relaxed font-medium">
                Sistem akan melakukan simulasi upload untuk mengecek validitas data dan menampilkan error jika ada,
                <strong>tanpa menyimpan perubahan apapun</strong> ke database.
              </p>
            </div>
          </label>

          <div class="mt-auto shrink-0">
            <button
              @click="handleImport"
              :disabled="!selectedFile || isImporting"
              class="w-full px-5 py-4 bg-primary text-secondary rounded-2xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 flex justify-center items-center gap-2 transition-all text-[15px]"
            >
              <font-awesome-icon v-if="isImporting" icon="fa-solid fa-spinner" spin />
              <font-awesome-icon v-else icon="fa-solid fa-upload" />
              <span>{{ isImporting ? 'Mengunggah...' : 'Upload & Terapkan Perubahan' }}</span>
            </button>
          </div>
        </div>

        <!-- STEP 3: LOGS -->
        <div
          v-if="activeTab === 'logs'"
          class="flex-1 flex flex-col h-full overflow-hidden bg-secondary/5 rounded-2xl border border-secondary/10 p-3"
        >
          <ImportJobHistory :job-types="['BATCH_EDIT_PRODUCT', 'BATCH_EDIT_PRODUCT_DRY_RUN']" />
        </div>
      </div>
    </div>
  </BaseModal>
</template>
