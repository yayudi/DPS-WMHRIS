<script setup>
import { ref, computed, watch } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import {
  uploadPickingList,
  confirmPickingList,
  fetchPickingHistory,
  fetchPickingDetails,
  voidPickingList,
  cancelPickingList,
} from '@/api/helpers/picking.js' // Asumsi helper sudah ada
import Tabs from '@/components/Tabs.vue'
import PickingListDetailsModal from '@/components/PickingListDetailsModal.vue' // Komponen modal detail

const { show } = useToast()

// --- STATE ---
const activeTab = ref('upload')
const selectedFile = ref(null)
const selectedSource = ref('Tokopedia')
const isLoading = ref(false)

// State untuk hasil validasi
const validationResults = ref(null)
const selectedItems = ref({})

// State untuk riwayat
const pickingHistoryList = ref([])
const isLoadingHistory = ref(false)
const selectedHistoryItem = ref(null)
const isDetailsModalOpen = ref(false)

// --- COMPUTED ---
// Menghitung item yang dicentang untuk dikonfirmasi
const allValidItemsSelected = computed({
  get() {
    if (!validationResults.value || validationResults.value.validItems.length === 0) {
      return false
    }
    return validationResults.value.validItems.every((item) => selectedItems.value[item.sku])
  },
  set(value) {
    if (!validationResults.value) return
    validationResults.value.validItems.forEach((item) => {
      selectedItems.value[item.sku] = value
    })
  },
})

const itemsToConfirm = computed(() => {
  console.log('Calculating itemsToConfirm...') // Log saat computed property dihitung
  if (!validationResults.value || !validationResults.value.validItems) {
    console.log(' -> No validation data or valid items, returning [].')
    return []
  }
  console.log(
    ' -> Filtering validationResults.validItems based on selectedItems:',
    JSON.parse(JSON.stringify(selectedItems.value)),
  )
  const filtered = validationResults.value.validItems.filter((item) => {
    const isSelected = selectedItems.value[item.sku]
    console.log(` -> Checking item ${item.sku}: selected = ${isSelected}`) // Log status centang per item
    return isSelected === true // Pastikan perbandingan eksplisit
  })
  console.log(' -> Resulting itemsToConfirm:', JSON.parse(JSON.stringify(filtered)))
  return validationResults.value.validItems.filter((item) => selectedItems.value[item.sku])
})

// --- METHODS ---
function handleFileChange(event) {
  selectedFile.value = event.target.files[0]
  validationResults.value = null // Reset validasi saat file berubah
  selectedItems.value = {}
}

async function handleUpload() {
  if (!selectedFile.value) {
    show('Pilih file picking list terlebih dahulu.', 'warning')
    return
  }
  isLoading.value = true
  validationResults.value = null
  selectedItems.value = {}

  const formData = new FormData()
  formData.append('pickingListFile', selectedFile.value)
  formData.append('source', selectedSource.value)

  try {
    const response = await uploadPickingList(formData)
    validationResults.value = response.data
    // Otomatis centang semua item valid pada awalnya
    response.data.validItems.forEach((item) => {
      selectedItems.value[item.sku] = true
    })
    show(
      `File berhasil di-upload. ${response.data.validItems.length} item valid, ${response.data.invalidSkus.length} SKU tidak valid.`,
      'success',
    )
  } catch (error) {
    show(error.message || 'Gagal mengupload file.', 'error')
  } finally {
    isLoading.value = false
    // Reset input file agar bisa upload file yang sama lagi
    const fileInput = document.getElementById('pickingListFile')
    if (fileInput) {
      fileInput.value = ''
    }
    selectedFile.value = null // Clear selected file state
  }
}

async function handleConfirm() {
  if (!validationResults.value?.pickingListId || itemsToConfirm.value.length === 0) {
    show('Tidak ada item valid yang dipilih.', 'warning')
    return
  }
  isLoading.value = true
  try {
    // Kirim hanya item yang dicentang
    const payload = {
      items: itemsToConfirm.value.map((item) => ({ sku: item.sku, qty: item.qty })),
    }
    const response = await confirmPickingList(validationResults.value.pickingListId, payload)
    show(response.message, 'success')
    validationResults.value = null // Reset tampilan validasi
    selectedItems.value = {}
    activeTab.value = 'history' // Pindah ke tab riwayat setelah sukses
    // loadHistory() // Muat ulang riwayat
  } catch (error) {
    show(error.message || 'Gagal mengonfirmasi picking list.', 'error')
  } finally {
    isLoading.value = false
  }
}

function handleCancelValidation() {
  validationResults.value = null
  selectedItems.value = {}
  const fileInput = document.getElementById('pickingListFile')
  if (fileInput) {
    fileInput.value = ''
  }
  selectedFile.value = null
}

// --- History Methods ---
async function loadHistory() {
  isLoadingHistory.value = true
  pickingHistoryList.value = [] // Reset history (RENAME)
  try {
    const responseData = await fetchPickingHistory() // Helper mengembalikan array langsung

    // --- LOG UNTUK DEBUG (Opsional, bisa dihapus) ---
    console.log(
      'DEBUG: Respons dari fetchPickingHistory (seharusnya array):',
      JSON.parse(JSON.stringify(responseData)),
    )
    // --- AKHIR LOG ---

    // --- FIX: Cek jika responseData adalah array ---
    // --- RENAME: Gunakan pickingHistoryList ---
    pickingHistoryList.value = Array.isArray(responseData) ? responseData : [] // Langsung assign array

    // Handle jika bukan array (meskipun log menunjukkan array)
    if (!Array.isArray(responseData)) {
      let errorMsg = 'Gagal memuat riwayat: Format data tidak sesuai (bukan array).'
      console.error(
        'DEBUG: Tipe data respons fetchPickingHistory:',
        typeof responseData,
        responseData,
      ) // Log tipe data jika salah
      show(errorMsg, 'error')
      // pickingHistoryList.value sudah di-set [] di atas, jadi tidak perlu lagi
    }
    // --- AKHIR FIX & RENAME ---
  } catch (error) {
    // Tangani error network atau error yang dilempar oleh helper
    show(error.message || 'Gagal memuat riwayat (catch).', 'error')
    pickingHistoryList.value = [] // Pastikan tetap array kosong saat error (RENAME)
  } finally {
    isLoadingHistory.value = false
  }
}

async function openDetailsModal(item) {
  console.log('Opening modal for item:', JSON.parse(JSON.stringify(item)))
  selectedHistoryItem.value = { ...item, details: null, loading: true } // Set loading true
  isDetailsModalOpen.value = true
  try {
    const response = await fetchPickingDetails(item.id)
    selectedHistoryItem.value.details = response.data
  } catch (error) {
    show(`Gagal memuat detail untuk list #${item.id}.`, 'error')
    selectedHistoryItem.value.details = [] // Set ke array kosong jika error
  } finally {
    selectedHistoryItem.value.loading = false // Set loading false
  }
}

async function handleVoidConfirm(pickingListId) {
  isDetailsModalOpen.value = false
  isLoadingHistory.value = true
  try {
    const response = await voidPickingList(pickingListId)
    if (response.success) {
      show(response.message, 'success')
      await loadHistory()
    } else {
      show(response.message || 'Gagal membatalkan transaksi.', 'error')
    }
  } catch (error) {
    show(error.message || 'Gagal membatalkan transaksi.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

// --- TAMBAHAN: Logika untuk Aksi Pending ---
async function handleResumeValidation(item) {
  console.log('Resuming validation for item:', item.id)
  isLoadingHistory.value = true // Gunakan loading history
  validationResults.value = null
  selectedItems.value = {}

  try {
    // 1. Ambil detail item yang tersimpan
    const responseDetails = await fetchPickingDetails(item.id)
    if (!responseDetails.success || !Array.isArray(responseDetails.data)) {
      throw new Error(responseDetails.message || 'Gagal memuat detail item untuk validasi ulang.')
    }
    const savedItems = responseDetails.data // Array [{ sku, name, qty }]

    // 2. (Opsional tapi direkomendasikan) Ambil stok display TERBARU
    // Ini membutuhkan modifikasi backend /picking/:id/details ATAU endpoint baru
    // Untuk sekarang, kita akan gunakan stok yang MUNGKIN sudah usang dari upload awal
    // atau kita bisa buat query baru di sini jika perlu.
    // Kita perlu data: sku, qty (dari savedItems), name, is_package, current_stock, components
    // Kita bisa buat query baru di backend atau modifikasi /details

    // --- Untuk sementara, kita rekonstruksi data validasi dari history & details ---
    // Ini TIDAK akan punya info stok terbaru atau komponen, hanya list item
    validationResults.value = {
      pickingListId: item.id,
      validItems: savedItems.map((detail) => ({
        sku: detail.sku,
        qty: detail.qty,
        name: detail.name,
        is_package: false, // TIDAK TAHU DARI DETAILS SAJA! Perlu modif backend
        current_stock: '?', // TIDAK TAHU! Perlu query ulang stok
        components: null, // TIDAK TAHU! Perlu query ulang
      })),
      invalidSkus: [], // Anggap semua valid karena sudah di-save sebelumnya
    }

    // Auto select semua item
    validationResults.value.validItems.forEach(
      (validItem) => (selectedItems.value[validItem.sku] = true),
    )

    activeTab.value = 'upload' // Pindah ke tab upload
    show(
      `Memuat ulang validasi untuk Picking List #${item.id}. Stok mungkin perlu dicek ulang.`,
      'info',
    )
  } catch (error) {
    show(error.message || `Gagal melanjutkan validasi #${item.id}.`, 'error')
    validationResults.value = null // Pastikan layar validasi hilang jika gagal
  } finally {
    isLoadingHistory.value = false
  }
}

async function handleCancelPending(pickingListId) {
  // Gunakan confirm bawaan browser (atau ganti dengan modal konfirmasi Anda)
  if (
    !confirm(`Anda yakin ingin MEMBATALKAN picking list #${pickingListId} yang belum diproses ini?`)
  ) {
    return
  }
  isLoadingHistory.value = true
  try {
    const response = await cancelPickingList(pickingListId) // Panggil helper baru
    if (response.success) {
      show(response.message, 'success')
      await loadHistory() // Muat ulang riwayat
    } else {
      show(response.message || 'Gagal membatalkan picking list.', 'error')
    }
  } catch (error) {
    show(error.message || 'Gagal membatalkan picking list.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

// --- Lifecycle ---
watch(
  activeTab,
  (newTab) => {
    if (newTab === 'history') {
      loadHistory()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold text-text">Proses Picking List</h2>

    <!-- Tabs Upload / Riwayat -->
    <Tabs
      :tabs="[
        { label: 'Upload Baru', value: 'upload' },
        { label: 'Riwayat Proses', value: 'history' },
      ]"
      v-model:model-value="activeTab"
      class="mb-6"
    />

    <!-- Panel Upload -->
    <div
      v-if="activeTab === 'upload'"
      class="bg-background rounded-xl shadow border border-secondary/20 p-6 space-y-6"
    >
      <!-- Form Upload -->
      <div class="flex flex-col sm:flex-row items-end gap-4">
        <div class="flex-grow w-full">
          <label for="pickingListFile" class="block text-sm font-medium text-text/90 mb-2"
            >Pilih File (PDF/TXT)</label
          >
          <input
            type="file"
            id="pickingListFile"
            @change="handleFileChange"
            accept=".pdf,.txt"
            class="w-full text-sm text-text border border-secondary/50 rounded-lg cursor-pointer bg-secondary/10 file:mr-4 file:py-2 file:px-4 file:rounded-l-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
          />
        </div>
        <div class="w-full sm:w-auto">
          <label for="sourceSelect" class="block text-sm font-medium text-text/90 mb-2"
            >Sumber</label
          >
          <select
            id="sourceSelect"
            v-model="selectedSource"
            class="w-full p-2 border border-secondary/50 rounded-lg bg-background text-sm"
          >
            <option value="Tokopedia">Tokopedia</option>
            <option value="Shopee">Shopee</option>
            <option value="Offline">Offline</option>
          </select>
        </div>
        <button
          @click="handleUpload"
          :disabled="isLoading || !selectedFile"
          class="w-full sm:w-auto px-6 py-2 bg-primary text-white rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2 h-[42px]"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isLoading ? 'Memproses...' : 'Upload & Validasi' }}</span>
        </button>
      </div>

      <!-- Hasil Validasi -->
      <div v-if="validationResults" class="border-t border-secondary/20 pt-6 space-y-4">
        <h3 class="text-lg font-semibold text-text">Validasi Data Picking List</h3>

        <!-- Peringatan SKU Tidak Valid -->
        <div
          v-if="validationResults.invalidSkus.length > 0"
          class="p-4 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent"
        >
          <p class="font-semibold mb-2">
            <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-2" />SKU Tidak
            Ditemukan:
          </p>
          <ul class="list-disc list-inside">
            <li v-for="sku in validationResults.invalidSkus" :key="sku">{{ sku }}</li>
          </ul>
          <p class="mt-2 text-xs">
            Item dengan SKU ini tidak akan diproses. Periksa kembali file asli atau data produk.
          </p>
        </div>

        <!-- Tabel Item Valid -->
        <div v-if="validationResults.validItems.length > 0" class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="bg-secondary/10">
              <tr>
                <!-- Checkbox -->
                <th class="p-2 w-10">
                  <input
                    type="checkbox"
                    :checked="allValidItemsSelected"
                    @change="allValidItemsSelected = $event.target.checked"
                    title="Pilih/Batal Pilih Semua"
                    class="form-checkbox h-4 w-4 text-primary rounded border-secondary/50 focus:ring-primary/50"
                  />
                </th>
                <th class="p-2 text-left">SKU</th>
                <th class="p-2 text-left">Nama Produk</th>
                <th class="p-2 text-center">Stok Display</th>
                <th class="p-2 text-center w-24">Qty Ambil</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/20">
              <!-- Gunakan template v-for untuk handle paket -->
              <template v-for="item in validationResults.validItems" :key="item.sku">
                <!-- Baris Utama (Paket atau Single) -->
                <tr
                  :class="{
                    'bg-primary/5': selectedItems[item.sku],
                    'opacity-60': !selectedItems[item.sku],
                  }"
                >
                  <td class="p-2 text-center">
                    <input
                      type="checkbox"
                      v-model="selectedItems[item.sku]"
                      class="form-checkbox h-4 w-4 text-primary rounded border-secondary/50 focus:ring-primary/50"
                    />
                  </td>
                  <td class="p-2 font-mono">{{ item.sku }}</td>
                  <td class="p-2">{{ item.name }}</td>
                  <td
                    class="p-2 text-center font-semibold"
                    :class="{
                      'text-accent': item.current_stock < 0,
                      'text-warning': item.current_stock === 0,
                      'text-success': item.current_stock > 0 && item.current_stock < item.qty, // Stok kurang tapi > 0
                      'text-text/90': item.current_stock >= item.qty,
                    }"
                  >
                    {{ item.current_stock }}
                    <font-awesome-icon
                      v-if="item.current_stock < item.qty"
                      icon="fa-solid fa-triangle-exclamation"
                      class="ml-1 text-warning"
                      title="Stok display tidak mencukupi!"
                    />
                  </td>
                  {{
                    console.log(
                      'Rendering item:',
                      item.sku,
                      'is_package:',
                      item.is_package,
                      'components:',
                      item.components,
                    )
                  }}
                  <td class="p-2 text-center">
                    <span class="font-bold">
                      {{ item.qty }}
                    </span>
                  </td>
                </tr>
                <!-- Baris Komponen (Hanya jika paket dan ada komponen) -->
                <template v-if="item.is_package && item.components && item.components.length > 0">
                  <tr
                    v-for="(comp, index) in item.components"
                    :key="`${item.sku}-${comp.component_sku}`"
                    class="bg-secondary/5 text-xs text-text/80"
                    :class="{ 'opacity-60': !selectedItems[item.sku] }"
                  >
                    <td class="py-1 px-2 text-right italic" colspan="2">
                      Komponen {{ index + 1 }}:
                    </td>
                    <td class="py-1 px-2 italic">
                      <span class="font-mono mr-1">[{{ comp.component_sku }}]</span>
                      {{ comp.component_name }}
                    </td>
                    <td class="py-1 px-2 text-center italic">
                      <span
                        v-if="comp.component_stock_display !== undefined"
                        :class="{
                          'text-accent':
                            comp.component_stock_display < item.qty * comp.quantity_per_package,
                          'text-warning':
                            comp.component_stock_display === item.qty * comp.quantity_per_package,
                          'text-success':
                            comp.component_stock_display > item.qty * comp.quantity_per_package,
                          'text-text/90':
                            comp.component_stock_display >= item.qty * comp.quantity_per_package,
                        }"
                      >
                        {{ comp.component_stock_display }}
                      </span>
                    </td>
                    <td class="py-1 px-2 text-center italic">
                      butuh: {{ item.qty * comp.quantity_per_package }}
                    </td>
                  </tr>
                </template>
              </template>
              <!-- Akhir template v-for item -->
            </tbody>
          </table>
        </div>
        <div v-else class="text-center py-6 text-text/60">
          Tidak ada item valid yang ditemukan dalam file ini.
        </div>

        <!-- Tombol Aksi Validasi -->
        <div
          v-if="validationResults.validItems.length > 0"
          class="flex justify-between items-center pt-4 border-t border-secondary/20"
        >
          <p class="text-sm text-text/80">
            {{ itemsToConfirm.length }} dari {{ validationResults.validItems.length }} item dipilih
            untuk diproses.
          </p>
          <div class="flex gap-4">
            <button
              @click="handleCancelValidation"
              class="px-4 py-2 bg-secondary/30 text-text/80 rounded-lg font-semibold hover:bg-secondary/50"
              :disabled="isLoading"
            >
              Batal
            </button>
            <button
              @click="handleConfirm"
              :disabled="isLoading || itemsToConfirm.length === 0"
              class="px-6 py-2 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
            >
              <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
              <span>Konfirmasi & Kurangi Stok</span>
            </button>
          </div>
        </div>
      </div>
      <!-- Akhir Hasil Validasi -->
    </div>
    <!-- Akhir Panel Upload -->

    <!-- Panel Riwayat -->
    <div
      v-if="activeTab === 'history'"
      class="bg-background rounded-xl shadow border border-secondary/20 p-6 space-y-6"
    >
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-text">Riwayat Proses Picking List</h3>
        <button
          @click="loadHistory"
          :disabled="isLoadingHistory"
          class="text-primary text-sm hover:underline disabled:opacity-50 flex items-center gap-1"
        >
          <font-awesome-icon
            icon="fa-solid fa-sync"
            :class="{ 'animate-spin': isLoadingHistory }"
          />
          Refresh
        </button>
      </div>
      <!-- --- FIX: Tambahkan pengecekan `history` sebelum akses `.length` --- -->
      <div
        v-if="isLoadingHistory && (!pickingHistoryList || pickingHistoryList.length === 0)"
        class="text-center p-8 text-text/60"
      >
        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin mr-2" /> Memuat riwayat...
      </div>
      <div
        v-else-if="!isLoadingHistory && (!pickingHistoryList || pickingHistoryList.length === 0)"
        class="text-center p-8 text-text/60 italic"
      >
        Belum ada riwayat proses.
      </div>
      <!-- Pastikan history adalah array sebelum render tabel -->
      <div
        v-else-if="!isLoadingHistory && pickingHistoryList && pickingHistoryList.length > 0"
        class="max-h-[70vh] overflow-y-auto border border-secondary/20 rounded-lg"
      >
        <table class="min-w-full text-sm">
          <thead class="bg-secondary/10 sticky top-0 z-10">
            <tr>
              <th class="p-2 text-left">Waktu Proses</th>
              <th class="p-2 text-left">Nama File</th>
              <th class="p-2 text-left">Sumber</th>
              <th class="p-2 text-center">Status</th>
              <th class="p-2 text-left">Oleh</th>
              <th class="p-2 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/20">
            <tr
              v-for="item in pickingHistoryList"
              :key="item.id"
              class="hover:bg-primary/5 transition-colors duration-150 cursor-pointer"
              @click="openDetailsModal(item)"
            >
              <td class="p-2 whitespace-nowrap">
                {{
                  new Date(item.created_at).toLocaleString('id-ID', {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })
                }}
              </td>
              <td class="p-2 truncate max-w-xs" :title="item.original_filename">
                {{ item.original_filename }}
              </td>
              <td class="p-2">{{ item.source }}</td>
              <td class="p-2 text-center">
                <span
                  class="px-2.5 py-0.5 text-xs font-semibold rounded-full"
                  :class="{
                    'bg-success/10 text-success': item.status === 'COMPLETED',
                    'bg-accent/10 text-accent': item.status === 'CANCELLED',
                    'bg-warning/10 text-warning': item.status === 'PENDING_VALIDATION',
                    'bg-secondary/20 text-text/70': ![
                      'COMPLETED',
                      'CANCELLED',
                      'PENDING_VALIDATION',
                    ].includes(item.status),
                  }"
                  >{{ item.status }}</span
                >
              </td>
              <td class="p-2">{{ item.username }}</td>
              <td class="p-2 text-center space-x-3">
                <button
                  v-if="item.status === 'COMPLETED'"
                  @click.stop="handleVoidConfirm(item.id)"
                  class="text-accent hover:text-accent/80 transition-colors"
                  title="Batalkan & Kembalikan Stok"
                >
                  <font-awesome-icon icon="fa-solid fa-undo" />
                </button>
                <template v-if="item.status === 'PENDING_VALIDATION'">
                  <button
                    @click.stop="handleResumeValidation(item)"
                    class="text-primary hover:text-primary/80 transition-colors"
                    title="Lanjutkan Proses Validasi"
                  >
                    <font-awesome-icon icon="fa-solid fa-play-circle" />
                    <!-- Ganti ikon jika perlu -->
                  </button>
                  <button
                    @click.stop="handleCancelPending(item.id)"
                    class="text-secondary hover:text-secondary/80 transition-colors"
                    title="Batalkan Picking List"
                  >
                    <font-awesome-icon icon="fa-solid fa-times-circle" />
                    <!-- Ganti ikon jika perlu -->
                  </button>
                </template>
                <span v-else class="text-secondary/50" title="Aksi tidak tersedia">
                  <font-awesome-icon icon="fa-solid fa-undo" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <!-- Akhir Panel Riwayat -->

    <!-- Modal Detail Riwayat -->
    <PickingListDetailsModal
      :show="isDetailsModalOpen"
      :item="selectedHistoryItem"
      @close="isDetailsModalOpen = false"
      @void-confirmed="handleVoidConfirm"
    />
  </div>
  <!-- Akhir container utama -->
</template>

<style scoped>
/* Tambahkan styling khusus jika diperlukan */
/* Style untuk indentasi baris komponen */
.component-row td:first-child {
  padding-left: 2.5rem; /* Sesuaikan indentasi */
}
</style>
