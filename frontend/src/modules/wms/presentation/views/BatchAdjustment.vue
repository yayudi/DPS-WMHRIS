<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useMagicKeys, useLocalStorage } from '@vueuse/core'
import { useToast } from '@/composables/useToast'
import { fetchMyLocations } from '@/api/helpers/user'
import { stockApi } from '@/modules/wms/infrastructure/stock.api'
import { swalAlert, swalConfirm } from '@/composables/useSweetAlert'
import { useDownload } from '@/composables/useDownload'
import { useMobile } from '@/composables/useMobile'
import { useFirebaseSync } from '@/composables/useFirebaseSync'

import BatchAdjustmentHeader from '@/modules/wms/presentation/components/transfer/BatchAdjustmentHeader.vue'
import ProductSearchAddForm from '@/modules/wms/presentation/components/transfer/ProductSearchAddForm.vue'
import BatchItemList from '@/modules/wms/presentation/components/transfer/BatchItemList.vue'

const { toast } = useToast()
const { isMobile } = useMobile()
const { downloadFile } = useDownload()

// --- STATE UTAMA ---
const myLocations = ref([])
const isLoading = ref(false)
const batchList = useLocalStorage('draft-ba-batch', [])
const inputMode = useLocalStorage('draft-ba-mode', 'manual')
const adjustmentLocation = useLocalStorage('draft-ba-loc', null)
const notes = useLocalStorage('draft-ba-notes', '')
const importJobHistory = ref([])
const isImportHistoryLoading = ref(false)
const selectedFile = ref(null)
const isUploading = ref(false)
const uploadInputKey = ref(0)
const isDownloading = ref(false)

// Ambil data lokasi
onMounted(async () => {
  isLoading.value = true
  try {
    if (
      adjustmentLocation.value === '[object Object]' ||
      (typeof adjustmentLocation.value === 'object' &&
        adjustmentLocation.value !== null &&
        !adjustmentLocation.value.id)
    ) {
      adjustmentLocation.value = null
    }

    myLocations.value = await fetchMyLocations()
    await loadImportHistory()
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
})

// --- Handler untuk Impor ---
async function loadImportHistory(silent = false) {
  if (!silent) isImportHistoryLoading.value = true
  try {
    const response = await stockApi.getImportJobs()
    if (response.success && response.data) {
      importJobHistory.value = response.data.filter(job => job.job_type === 'ADJUST_STOCK' || job.jobType === 'ADJUST_STOCK')
    }
  } catch {
    toast('Gagal memuat riwayat impor', 'error')
  } finally {
    if (!silent) isImportHistoryLoading.value = false
  }
}

// Firebase Real-time Event Listener for Import Jobs
useFirebaseSync('BACKGROUND_JOBS', ['IMPORT_COMPLETED', 'IMPORT_FAILED'], () => {
  loadImportHistory(true)
})

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    const fileName = file.name
    const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()

    if (fileExt !== '.xlsx') {
      selectedFile.value = null
      uploadInputKey.value++
      return
    }
    selectedFile.value = file
  }
}

async function handleUploadAdjustment() {
  if (!selectedFile.value) {
    return
  }
  if (!notes.value.trim()) {
    return
  }

  isUploading.value = true
  try {
    const response = await stockApi.requestAdjustmentUpload(selectedFile.value, notes.value)
    toast(response.message || 'File diterima!', 'success')
    loadImportHistory()
    notes.value = ''
  } catch (error) {
    swalAlert('Gagal Upload', error.message || 'Terjadi kesalahan saat mengunggah file.', 'error')
  } finally {
    isUploading.value = false
    selectedFile.value = null
    uploadInputKey.value++
  }
}

async function downloadTemplate() {
  isDownloading.value = true
  try {
    await downloadFile('/stock/download-adjustment-template', 'Template_Adjustment_Stok.xlsx')
  } catch {
    toast('Gagal mengunduh template', 'error')
  } finally {
    isDownloading.value = false
  }
}

// --- Computed & Handler ---
let isRevertingLocation = false
watch(adjustmentLocation, async (newVal, oldVal) => {
  if (isRevertingLocation) {
    isRevertingLocation = false
    return
  }
  if (batchList.value.length > 0 && newVal && oldVal && newVal.id !== oldVal.id) {
    const isConfirmed = await swalConfirm(
      'Reset Daftar Produk?',
      'Anda memiliki produk di dalam daftar. Mengubah lokasi akan mereset seluruh inputan tersebut. Yakin ingin mengubah lokasi?',
      'Ya, Reset',
      'Batal'
    )
    if (isConfirmed) {
      batchList.value = []
    } else {
      isRevertingLocation = true
      adjustmentLocation.value = oldVal
    }
  }
})

const isBatchLocationSelected = computed(() => {
  return adjustmentLocation.value
})

const batchSearchLocationId = computed(() => {
  return adjustmentLocation.value?.id
})

async function handleAddProduct({ product, quantity }) {
  if (!product) {
    toast('Pilih produk dan masukkan kuantitas yang valid.', 'warning')
    return
  }

  if (product.current_stock === 0 && adjustmentLocation.value) {
    const isConfirmed = await swalConfirm(
      'Produk Tidak Tercatat di Lokasi Ini',
      `"${product.name}" (${product.sku}) memiliki stok 0 di lokasi ${adjustmentLocation.value.code}. Ini bisa berarti barang nyasar atau selisih positif. Lanjutkan menambahkan?`,
      'Ya, Tambahkan',
      'Batal'
    )
    if (!isConfirmed) return
  }

  const existing = batchList.value.find(item => item.sku === product.sku)
  if (existing) {
    existing.quantity += quantity
  } else {
    batchList.value.push({
      _id: Date.now() + Math.random(),
      sku: product.sku,
      name: product.name,
      current_stock: product.current_stock ?? 0,
      quantity: quantity
    })
  }
}

function removeFromBatch(index) {
  batchList.value.splice(index, 1)
}

function duplicateFromBatch(index) {
  const item = batchList.value[index]
  if (item) {
    batchList.value.splice(index + 1, 0, { ...item, _id: Date.now() + Math.random() })
  }
}

async function submitBatch() {
  if (!notes.value) {
    toast('Catatan mohon diisi.', 'warning')
    return
  }
  if (!isBatchLocationSelected.value || batchList.value.length === 0) {
    console.log('batchList.value :', batchList.value)
    console.log('adjustmentLocation.value :', adjustmentLocation.value)
    return
  }
  if (!notes.value.trim()) {
    console.log('notes.value :', notes.value)
    return
  }

  isLoading.value = true
  try {
    const payload = {
      type: 'OPNAME',
      fromLocationId: null,
      toLocationId: adjustmentLocation.value?.id || null,
      notes: notes.value,
      movements: batchList.value.map(({ sku, quantity }) => ({ sku, quantity }))
    }

    const response = await stockApi.processBatchMovement(payload)

    if (response.success) {
      toast(response.message, 'success')
      batchList.value = []
      adjustmentLocation.value = null
      notes.value = ''
    }
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isLoading.value = false
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, pressed => {
  if (pressed) {
    // Prevent default browser behavior if needed
    if (inputMode.value === 'manual') {
      if (isBatchLocationSelected.value && batchList.value.length > 0 && !isLoading.value) {
        submitBatch()
      }
    } else if (inputMode.value === 'upload') {
      if (selectedFile.value && notes.value.trim() && !isUploading.value) {
        handleUploadAdjustment()
      }
    }
  }
})
</script>

<template>
  <div class="animate-fade-in text-text">
    <div class="flex justify-center p-1 bg-secondary/10 rounded-lg max-w-md mx-auto">
      <button
        @click="inputMode = 'manual'"
        class="flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all duration-200"
        :class="
          inputMode === 'manual'
            ? 'bg-primary text-secondary shadow-md'
            : 'text-text/60 hover:bg-secondary/20 hover:text-text'
        "
      >
        <font-awesome-icon icon="fa-solid fa-pencil" class="mr-2" />
        Input Manual
      </button>
      <button
        @click="inputMode = 'upload'"
        class="flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all duration-200"
        :class="
          inputMode === 'upload'
            ? 'bg-primary text-secondary shadow-md'
            : 'text-text/60 hover:bg-secondary/20 hover:text-text'
        "
      >
        <font-awesome-icon icon="fa-solid fa-file-excel" class="mr-2" />
        Upload Excel
      </button>
    </div>

    <div v-if="inputMode === 'manual'" class="space-y-6 animate-fade-in">
      <BatchAdjustmentHeader
        v-model:adjustmentLocation="adjustmentLocation"
        v-model:notes="notes"
        :my-locations="myLocations"
        :is-loading="isLoading"
      />

      <ProductSearchAddForm
        active-tab="ADJUSTMENT"
        :search-location-id="batchSearchLocationId"
        :disabled="!isBatchLocationSelected || isLoading"
        @add-product="handleAddProduct"
      />

      <BatchItemList
        :items="batchList"
        active-tab="ADJUSTMENT"
        @remove-item="removeFromBatch"
        @duplicate-item="duplicateFromBatch"
      />

      <div class="flex justify-end pt-6 border-t border-secondary/20">
        <button
          @click="submitBatch"
          :disabled="!isBatchLocationSelected || batchList.length === 0 || isLoading"
          class="px-6 py-3 bg-primary text-secondary rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] group"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <font-awesome-icon v-else icon="fa-solid fa-paper-plane" />
          <span>{{ isLoading ? 'Memproses...' : 'Submit Batch Adjustment' }}</span>
          <kbd
            v-if="!isLoading"
            class="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-secondary/20 text-secondary border border-secondary/30 rounded font-mono shadow-sm group-hover:bg-secondary/30 transition-colors"
            >Alt+S</kbd
          >
        </button>
      </div>
    </div>

    <div v-if="inputMode === 'upload'" class="space-y-6 animate-fade-in">
      <div
        class="p-4 bg-primary/10 border border-primary/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <div class="flex items-center gap-3">
          <div class="bg-primary/20 p-2 rounded-full text-primary">
            <font-awesome-icon icon="fa-solid fa-circle-info" />
          </div>
          <span class="text-sm font-medium text-text/80">
            Gunakan template Excel resmi untuk menghindari kesalahan format data.
          </span>
        </div>

        <button
          @click="downloadTemplate"
          :disabled="isDownloading"
          class="px-4 py-2 bg-primary text-secondary rounded-lg text-sm font-bold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 transition-all whitespace-nowrap shadow-sm"
        >
          <font-awesome-icon v-if="isDownloading" icon="fa-solid fa-spinner" class="animate-spin" />
          <font-awesome-icon v-else icon="fa-solid fa-download" />
          <span>{{ isDownloading ? 'Mengunduh...' : 'Unduh Template' }}</span>
        </button>
      </div>

      <div class="space-y-5 p-6 bg-secondary/5 border border-secondary/20 rounded-xl">
        <div>
          <label for="upload-notes" class="block text-xs font-bold text-text/60 uppercase mb-1.5">
            Catatan/Alasan Penyesuaian
          </label>
          <textarea
            id="upload-notes"
            v-model="notes"
            rows="2"
            class="w-full p-3 border border-secondary/30 rounded-lg bg-background text-sm focus:ring-1 focus:ring-primary/50 focus:border-primary outline-none transition-colors placeholder:text-text/30"
            placeholder="Contoh: Stock Opname Bulanan Gudang A..."
          ></textarea>
        </div>

        <div>
          <label for="file-upload" class="block text-xs font-bold text-text/60 uppercase mb-1.5">
            Pilih File Penyesuaian (.xlsx)
          </label>
          <div class="relative group">
            <input
              type="file"
              :key="uploadInputKey"
              id="file-upload"
              @change="handleFileSelect"
              accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="w-full text-sm text-text/70 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:transition-colors cursor-pointer border border-secondary/30 rounded-lg bg-background"
            />
          </div>
          <p class="text-[10px] text-text/40 mt-1.5 italic">
            *Hanya format .xlsx yang didukung. Maksimal ukuran file 5MB.
          </p>
        </div>

        <button
          @click="handleUploadAdjustment"
          :disabled="isUploading || !selectedFile || !notes.trim()"
          class="w-full px-4 py-3 bg-primary text-secondary rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] mt-2 group"
        >
          <font-awesome-icon v-if="isUploading" icon="fa-solid fa-spinner" class="animate-spin" />
          <font-awesome-icon v-else icon="fa-solid fa-cloud-arrow-up" />
          <span>{{ isUploading ? 'Mengunggah...' : 'Unggah dan Proses File' }}</span>
          <kbd
            v-if="!isUploading"
            class="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] bg-secondary/20 text-secondary border border-secondary/30 rounded font-mono shadow-sm group-hover:bg-secondary/30 transition-colors"
            >Alt+S</kbd
          >
        </button>
      </div>

      <div class="mt-8">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-sm font-bold text-text/70 uppercase tracking-wide">Riwayat Impor</h3>
        </div>
        <div class="overflow-hidden border border-secondary/20 rounded-xl shadow-sm">
          <table class="divide-y divide-secondary/10" :class="isMobile ? 'w-full block' : 'min-w-full'">
            <thead :class="isMobile ? 'hidden' : 'bg-secondary/10'">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">Tanggal</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">File</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">Catatan</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">Pengunggah</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">Log</th>
              </tr>
            </thead>
            <tbody class="bg-background" :class="isMobile ? 'block' : 'divide-y divide-secondary/10'">
              <tr v-if="importJobHistory.length === 0 && !isImportHistoryLoading">
                <td colspan="6" class="px-4 py-8 text-sm text-text/40 text-center italic">
                  <font-awesome-icon
                    icon="fa-solid fa-clock-rotate-left"
                    class="mb-2 text-xl opacity-20 block mx-auto"
                  />
                  Belum ada riwayat impor.
                </td>
              </tr>
              <tr v-if="isImportHistoryLoading">
                <td colspan="6" class="px-4 py-8 text-center text-text/40">
                  <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin mr-2" />
                  Memuat data...
                </td>
              </tr>
              <tr
                v-for="job in importJobHistory"
                :key="job.id"
                class="transition-colors"
                :class="
                  isMobile
                    ? 'block mb-4 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-4 mt-4'
                    : 'hover:bg-secondary/5'
                "
              >
                <td
                  :class="
                    isMobile
                      ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                      : 'px-4 py-3 text-xs text-text'
                  "
                >
                  <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Tanggal</span>
                  <div class="flex flex-col" :class="isMobile ? 'items-end' : ''">
                    <div class="font-medium">
                      {{ new Date(job.created_at || job.createdAt).toLocaleDateString('id-ID') }}
                    </div>
                    <div class="text-text/40">
                      {{ new Date(job.created_at || job.createdAt).toLocaleTimeString('id-ID') }}
                    </div>
                  </div>
                </td>
                <td
                  :class="
                    isMobile
                      ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                      : 'px-4 py-3 text-xs text-text/80 font-mono'
                  "
                >
                  <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">File</span>
                  <span class="font-mono text-xs">{{ job.original_filename }}</span>
                </td>
                <td
                  :class="
                    isMobile
                      ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                      : 'px-4 py-3 text-xs text-text'
                  "
                >
                  <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Catatan</span>
                  <span class="text-xs">{{ job.notes || '-' }}</span>
                </td>
                <td
                  :class="
                    isMobile
                      ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                      : 'px-4 py-3 text-xs text-text font-medium'
                  "
                >
                  <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Pengunggah</span>
                  <span class="text-xs capitalize">{{ job.uploader_name || '-' }}</span>
                </td>
                <td
                  :class="
                    isMobile
                      ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                      : 'px-4 py-3 text-xs'
                  "
                >
                  <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Status</span>
                  <span
                    v-if="job.status === 'COMPLETED'"
                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-success/10 text-success border border-success/20"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" /> Selesai
                  </span>
                  <span
                    v-else-if="job.status === 'FAILED'"
                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-danger/10 text-danger border border-danger/20"
                  >
                    <font-awesome-icon icon="fa-solid fa-xmark" /> Gagal
                  </span>
                  <span
                    v-else-if="job.status === 'COMPLETED_WITH_ERRORS'"
                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-warning/10 text-warning border border-warning/20"
                  >
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" /> Selesai (Ada Error)
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-secondary/10 text-secondary border border-secondary/20"
                  >
                    <font-awesome-icon icon="fa-solid fa-spinner" spin /> {{ job.status }}
                  </span>
                </td>
                <td
                  :class="
                    isMobile
                      ? 'flex justify-between items-center py-2'
                      : 'px-4 py-3 text-xs text-text/60 max-w-[200px] truncate'
                  "
                  :title="job.log_summary"
                >
                  <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Log</span>
                  <span class="text-text/60 text-xs">{{ job.log_summary || '-' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
