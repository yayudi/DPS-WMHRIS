<!-- frontend\src\views\WMSBatchAdjustment.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { fetchMyLocations } from '@/api/helpers/user.js'
import {
  processBatchMovement,
  requestAdjustmentUpload,
  getImportJobs,
} from '@/api/helpers/stock.js'
import { useAuthStore } from '@/stores/auth.js'
import api from '@/api/axios.js' // [BARU] Impor instance axios Anda

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
const notes = ref('') // State 'notes' ini sekarang akan digunakan juga di mode 'upload'
const importJobHistory = ref([])
const isImportHistoryLoading = ref(false)
const selectedFile = ref(null)
const isUploading = ref(false)
const uploadInputKey = ref(0)
const isDownloading = ref(false) // [BARU] State untuk loading unduh

// Ambil data lokasi
onMounted(async () => {
  isLoading.value = true
  try {
    myLocations.value = await fetchMyLocations()
    await loadImportHistory() // Muat riwayat impor saat halaman dibuka
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

    // [DIUBAH] Validasi diubah dari .csv ke .xlsx
    if (fileExt !== '.xlsx') {
      show('Hanya file .xlsx yang diizinkan.', 'error')
      selectedFile.value = null
      uploadInputKey.value++ // Reset input
      return
    }
    selectedFile.value = file
  }
}

async function handleUploadAdjustment() {
  if (!selectedFile.value) {
    show('Pilih file .xlsx terlebih dahulu.', 'error') // [DIUBAH] Teks diubah
    return
  }
  if (!notes.value.trim()) {
    // [BARU] Validasi notes ditambahkan
    show('Catatan/alasan wajib diisi untuk unggahan.', 'error')
    return
  }

  isUploading.value = true
  try {
    // [DIUBAH] Sekarang kita mengirim file dan notes.
    const response = await requestAdjustmentUpload(selectedFile.value, notes.value)

    show(response.message || 'File diterima!', 'success')
    loadImportHistory() // Muat ulang riwayat impor
    notes.value = '' // [BARU] Kosongkan catatan setelah berhasil
  } catch (error) {
    show(error.message || 'Gagal mengunggah file.', 'error')
  } finally {
    isUploading.value = false
    selectedFile.value = null
    uploadInputKey.value++ // Reset input file setelah upload
  }
}

// [BARU] Fungsi untuk menangani unduhan template via Axios
async function downloadTemplate() {
  isDownloading.value = true
  try {
    // 1. Buat request ke API menggunakan axios (ini akan menyertakan token auth)

    // [DIUBAH] Menghapus '/api' yang berlebihan dari URL.
    // '/api/stock/download-adjustment-template' -> '/stock/download-adjustment-template'
    const response = await api.get('/stock/download-adjustment-template', {
      responseType: 'blob', // Penting: minta data sebagai blob
    })

    // 2. Buat URL sementara untuk blob
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    // 3. Atur nama file
    link.setAttribute('download', 'Template_Adjustment_Stok.xlsx')

    // 4. Klik link secara virtual untuk men-trigger unduhan
    document.body.appendChild(link)
    link.click()

    // 5. Hapus link setelah selesai
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
      // Reset form
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
  <div class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-bold text-text">Stock Adjustment (Batch)</h2>
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <!-- Toggle Mode Input -->
      <div class="flex justify-center p-1 bg-secondary/10 rounded-lg">
        <button
          @click="inputMode = 'manual'"
          class="w-1/2 py-2 px-4 rounded-md text-sm font-medium"
          :class="
            inputMode === 'manual'
              ? 'bg-primary text-white shadow'
              : 'text-text/70 hover:bg-secondary/20'
          "
        >
          <font-awesome-icon icon="fa-solid fa-pencil" class="mr-2" />
          Input Manual
        </button>
        <button
          @click="inputMode = 'upload'"
          class="w-1/2 py-2 px-4 rounded-md text-sm font-medium"
          :class="
            inputMode === 'upload'
              ? 'bg-primary text-white shadow'
              : 'text-text/70 hover:bg-secondary/20'
          "
        >
          <!-- [DIUBAH] Ikon dan teks diubah dari CSV ke Excel -->
          <font-awesome-icon icon="fa-solid fa-file-excel" class="mr-2" />
          Upload Excel
        </button>
      </div>

      <!-- MODE INPUT MANUAL -->
      <div v-if="inputMode === 'manual'" class="space-y-6">
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
            class="px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
          >
            <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
            <span>{{ isLoading ? 'Memproses...' : 'Submit Batch Adjustment' }}</span>
          </button>
        </div>
      </div>

      <!-- [DIUBAH] MODE UPLOAD EXCEL -->
      <div v-if="inputMode === 'upload'" class="space-y-6">
        <!-- [DIUBAH] Tombol Unduh Template -->
        <div
          class="p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between"
        >
          <span class="text-sm font-medium text-primary">
            Gunakan template Excel untuk menghindari error.
          </span>
          <!-- [DIUBAH] Mengganti <a> dengan <button> yang memanggil fungsi baru -->
          <button
            @click="downloadTemplate"
            :disabled="isDownloading"
            class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
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

        <!-- Form Upload -->
        <div class="space-y-4 p-4 bg-secondary/10 border border-secondary/20 rounded-lg">
          <!-- [BARU] Input Catatan ditambahkan -->
          <div>
            <label for="upload-notes" class="block text-sm font-medium text-text/90 mb-1">
              Catatan/Alasan Penyesuaian
            </label>
            <textarea
              id="upload-notes"
              v-model="notes"
              rows="2"
              class="w-full p-2 border border-secondary/30 rounded-md bg-background text-sm focus:ring-primary focus:border-primary"
              placeholder="Contoh: Stock Opname Bulanan Gudang A"
            ></textarea>
          </div>

          <div>
            <!-- [DIUBAH] Label diubah ke .xlsx -->
            <label for="file-upload" class="block text-sm font-medium text-text/90 mb-1">
              Pilih File Penyesuaian (.xlsx)
            </label>
            <input
              type="file"
              :key="uploadInputKey"
              id="file-upload"
              @change="handleFileSelect"
              accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="w-full text-sm text-text file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
            <!-- [DIUBAH] Teks bantuan diubah -->
            <p class="text-xs text-text/60 mt-1">
              Format file harus .xlsx dan sesuai dengan template yang disediakan.
            </p>
          </div>

          <button
            @click="handleUploadAdjustment"
            :disabled="isUploading || !selectedFile || !notes.trim()"
            class="w-full px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90"
          >
            <font-awesome-icon v-if="isUploading" icon="fa-solid fa-spinner" class="animate-spin" />
            <font-awesome-icon v-else icon="fa-solid fa-upload" />
            <span>{{ isUploading ? 'Mengunggah...' : 'Unggah dan Proses File' }}</span>
          </button>
        </div>

        <!-- Tabel Riwayat Impor -->
        <div class="mt-8">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-text">Riwayat Impor Anda</h3>
            <button
              @click="loadImportHistory"
              :disabled="isImportHistoryLoading"
              class="text-sm text-primary hover:underline disabled:opacity-5Z0"
            >
              <font-awesome-icon
                icon="fa-solid fa-sync"
                :class="{ 'animate-spin': isImportHistoryLoading }"
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
                    File Asli
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
                    Hasil
                  </th>
                </tr>
              </thead>
              <tbody class="bg-background divide-y divide-secondary/20">
                <tr v-if="importJobHistory.length === 0 && !isImportHistoryLoading">
                  <td colspan="4" class="px-4 py-3 text-sm text-text/60 text-center italic">
                    Belum ada riwayat impor.
                  </td>
                </tr>
                <tr v-if="isImportHistoryLoading">
                  <td colspan="4" class="px-4 py-3 text-sm text-text/60 text-center">
                    <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin" />
                    Memuat...
                  </td>
                </tr>
                <tr v-for="job in importJobHistory" :key="job.id">
                  <td class="px-4 py-3 text-sm text-text">
                    {{ new Date(job.created_at).toLocaleString('id-ID') }}
                  </td>
                  <td class="px-4 py-3 text-sm text-text">{{ job.original_filename }}</td>
                  <td class="px-4 py-3 text-sm">
                    <span v-if="job.status === 'COMPLETED'" class="font-medium text-green-600"
                      >Selesai</span
                    >
                    <span v-else-if="job.status === 'FAILED'" class="font-medium text-red-600"
                      >Gagal</span
                    >
                    <span v-else class="font-medium text-yellow-500">{{ job.status }}...</span>
                  </td>
                  <td class="px-4 py-3 text-sm text-text/80" :title="job.log_summary">
                    {{
                      job.log_summary
                        ? job.log_summary.substring(0, 100) +
                          (job.log_summary.length > 100 ? '...' : '')
                        : '-'
                    }}
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
