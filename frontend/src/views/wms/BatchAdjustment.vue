<!-- frontend\src\views\WMSBatchAdjustment.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { fetchMyLocations } from '@/api/helpers/user.js'
import {
  processBatchMovement,
  requestAdjustmentUpload,
  getImportJobs,
} from '@/api/helpers/stock.js'
import { useAuthStore } from '@/stores/auth.js'
import api from '@/api/axios.js'

// Impor komponen anak
import BatchAdjustmentHeader from '@/components/batch/BatchAdjustmentHeader.vue'
import ProductSearchAddForm from '@/components/batch/ProductSearchAddForm.vue'
import BatchItemList from '@/components/batch/BatchItemList.vue'

const { show } = useToast()
const auth = useAuthStore()

// --- STATE UTAMA ---
const myLocations = ref([])
const isLoading = ref(false)
const batchList = ref([])
const inputMode = ref('manual')
const adjustmentLocation = ref(null)
const notes = ref('')
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
    myLocations.value = await fetchMyLocations()
    await loadImportHistory()
  } catch (error) {
    show('Gagal memuat data awal.', 'error')
  } finally {
    isLoading.value = false
  }
})

// --- Handler untuk Impor ---
async function loadImportHistory() {
  isImportHistoryLoading.value = true
  try {
    const response = await getImportJobs()
    if (response.success) {
      importJobHistory.value = response.data
    }
  } catch (error) {
    console.error('Gagal memuat riwayat impor:', error)
    show('Gagal memuat riwayat laporan impor', 'error')
  } finally {
    isImportHistoryLoading.value = false
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0]
  if (file) {
    const fileName = file.name
    const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()

    if (fileExt !== '.xlsx') {
      show('Hanya file .xlsx yang diizinkan.', 'error')
      selectedFile.value = null
      uploadInputKey.value++
      return
    }
    selectedFile.value = file
  }
}

async function handleUploadAdjustment() {
  if (!selectedFile.value) {
    show('Pilih file .xlsx terlebih dahulu.', 'error')
    return
  }
  if (!notes.value.trim()) {
    show('Catatan/alasan wajib diisi untuk unggahan.', 'error')
    return
  }

  isUploading.value = true
  try {
    const response = await requestAdjustmentUpload(selectedFile.value, notes.value)
    show(response.message || 'File diterima!', 'success')
    loadImportHistory()
    notes.value = ''
  } catch (error) {
    show(error.message || 'Gagal mengunggah file.', 'error')
  } finally {
    isUploading.value = false
    selectedFile.value = null
    uploadInputKey.value++
  }
}

async function downloadTemplate() {
  isDownloading.value = true
  try {
    const response = await api.get('/stock/download-adjustment-template', {
      responseType: 'blob',
    })

    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'Template_Adjustment_Stok.xlsx')

    document.body.appendChild(link)
    link.click()
    link.parentNode.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Gagal mengunduh template:', error)
    show('Gagal mengunduh template. Cek console untuk detail.', 'error')
  } finally {
    isDownloading.value = false
  }
}

// --- Computed & Handler ---
const isBatchLocationSelected = computed(() => {
  return adjustmentLocation.value
})

const batchSearchLocationId = computed(() => {
  return adjustmentLocation.value?.id
})

function handleAddProduct({ product, quantity }) {
  if (!product || !quantity) {
    show('Pilih produk dan masukkan kuantitas yang valid.', 'warning')
    return
  }
  if (quantity === 0) {
    show('Kuantitas penyesuaian tidak boleh nol.', 'warning')
    return
  }

  const existing = batchList.value.find((item) => item.sku === product.sku)
  if (existing) {
    existing.quantity += quantity
  } else {
    batchList.value.push({
      sku: product.sku,
      name: product.name,
      current_stock: product.current_stock,
      quantity: quantity,
    })
  }
}

function removeFromBatch(sku) {
  batchList.value = batchList.value.filter((item) => item.sku !== sku)
}

async function submitBatch() {
  if (!isBatchLocationSelected.value || batchList.value.length === 0) {
    show('Harap lengkapi lokasi dan tambahkan setidaknya satu item.', 'error')
    return
  }
  if (!notes.value.trim()) {
    show('Catatan/alasan wajib diisi untuk penyesuaian stok.', 'error')
    return
  }

  isLoading.value = true
  try {
    const payload = {
      type: 'ADJUSTMENT',
      fromLocationId: null,
      toLocationId: adjustmentLocation.value?.id || null,
      notes: notes.value,
      movements: batchList.value.map(({ sku, quantity }) => ({ sku, quantity })),
    }

    const response = await processBatchMovement(payload)

    if (response.success) {
      show(response.message, 'success')
      batchList.value = []
      adjustmentLocation.value = null
      notes.value = ''
    }
  } catch (error) {
    show(error.message || 'Terjadi kesalahan saat submit batch.', 'error')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="p-6 animate-fade-in text-text">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-text flex items-center gap-3">
        <font-awesome-icon icon="fa-solid fa-clipboard-check" class="text-primary" />
        Stock Adjustment (Batch)
      </h2>
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <div class="flex justify-center p-1 bg-secondary/10 rounded-lg max-w-md mx-auto">
        <button
          @click="inputMode = 'manual'"
          class="flex-1 py-2 px-4 rounded-md text-sm font-bold transition-all duration-200"
          :class="
            inputMode === 'manual'
              ? 'bg-primary text-white shadow-md'
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
              ? 'bg-primary text-white shadow-md'
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

        <BatchItemList :items="batchList" active-tab="ADJUSTMENT" @remove-item="removeFromBatch" />

        <div class="flex justify-end pt-6 border-t border-secondary/20">
          <button
            @click="submitBatch"
            :disabled="!isBatchLocationSelected || batchList.length === 0 || isLoading"
            class="px-6 py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
          >
            <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
            <font-awesome-icon v-else icon="fa-solid fa-paper-plane" />
            <span>{{ isLoading ? 'Memproses...' : 'Submit Batch Adjustment' }}</span>
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
            class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 transition-all whitespace-nowrap shadow-sm"
          >
            <font-awesome-icon
              v-if="isDownloading"
              icon="fa-solid fa-spinner"
              class="animate-spin"
            />
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
            class="w-full px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] mt-2"
          >
            <font-awesome-icon v-if="isUploading" icon="fa-solid fa-spinner" class="animate-spin" />
            <font-awesome-icon v-else icon="fa-solid fa-cloud-arrow-up" />
            <span>{{ isUploading ? 'Mengunggah...' : 'Unggah dan Proses File' }}</span>
          </button>
        </div>

        <div class="mt-8">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-sm font-bold text-text/70 uppercase tracking-wide">Riwayat Impor</h3>
            <button
              @click="loadImportHistory"
              :disabled="isImportHistoryLoading"
              class="text-xs text-primary font-bold hover:text-primary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              <font-awesome-icon
                icon="fa-solid fa-rotate"
                :class="{ 'animate-spin': isImportHistoryLoading }"
              />
              Refresh
            </button>
          </div>
          <div class="overflow-hidden border border-secondary/20 rounded-xl shadow-sm">
            <table class="min-w-full divide-y divide-secondary/10">
              <thead class="bg-secondary/10">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">
                    Tanggal
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">File</th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">
                    Status
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-bold text-text/60 uppercase">Log</th>
                </tr>
              </thead>
              <tbody class="bg-background divide-y divide-secondary/10">
                <tr v-if="importJobHistory.length === 0 && !isImportHistoryLoading">
                  <td colspan="4" class="px-4 py-8 text-sm text-text/40 text-center italic">
                    <font-awesome-icon
                      icon="fa-solid fa-clock-rotate-left"
                      class="mb-2 text-xl opacity-20 block mx-auto"
                    />
                    Belum ada riwayat impor.
                  </td>
                </tr>
                <tr v-if="isImportHistoryLoading">
                  <td colspan="4" class="px-4 py-8 text-center text-text/40">
                    <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin mr-2" />
                    Memuat data...
                  </td>
                </tr>
                <tr
                  v-for="job in importJobHistory"
                  :key="job.id"
                  class="hover:bg-secondary/5 transition-colors"
                >
                  <td class="px-4 py-3 text-xs text-text">
                    <div class="font-medium">
                      {{ new Date(job.created_at).toLocaleDateString('id-ID') }}
                    </div>
                    <div class="text-text/40">
                      {{ new Date(job.created_at).toLocaleTimeString('id-ID') }}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs text-text/80 font-mono">
                    {{ job.original_filename }}
                  </td>
                  <td class="px-4 py-3 text-xs">
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
                      v-else
                      class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold bg-warning/10 text-warning border border-warning/20"
                    >
                      <font-awesome-icon icon="fa-solid fa-spinner" spin /> {{ job.status }}
                    </span>
                  </td>
                  <td
                    class="px-4 py-3 text-xs text-text/60 max-w-[200px] truncate"
                    :title="job.log_summary"
                  >
                    {{ job.log_summary || '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Utility animations */
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
</style>
