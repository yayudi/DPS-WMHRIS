<!-- frontend\src\views\WMSPickingListView.vue -->
<script setup>
import { ref, watch, nextTick } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import {
  confirmPickingList,
  fetchPickingHistory,
  fetchPickingDetails,
  voidPickingList,
  cancelPickingList,
} from '@/api/helpers/picking.js'
import Tabs from '@/components/Tabs.vue'
import PickingUploadForm from '@/components/picking/PickingUploadForm.vue'
import PickingValidationDisplay from '@/components/picking/PickingValidationDisplay.vue'
import PickingHistoryTable from '@/components/picking/PickingHistoryTable.vue'
import PickingListDetailsModal from '@/components/PickingListDetailsModal.vue'

const toast = useToast()

const activeTab = ref('upload')
const isLoading = ref(false)
const loadingMessage = ref('')
const validationResults = ref(null)
const pickingHistoryList = ref([])
const isLoadingHistory = ref(false)
const selectedHistoryItem = ref(null)
const isDetailsModalOpen = ref(false)

/**
 * @param {object | undefined} validationData - Hasil validasi (undefined jika CSV, objek jika PDF)
 */
async function handleUploadComplete(validationData) {
  try {
    if (validationData) {
      // Ini adalah upload PDF (Tokopedia/Shopee), tampilkan layar validasi
      validationResults.value = validationData
      // Tetap di tab 'upload'
      toast.show('Validasi berhasil! Silakan periksa hasilnya di bawah.', 'success')
      await loadHistory()
    } else {
      // Ini adalah upload CSV (Tagihan), proses selesai
      // Pindah ke tab riwayat dan refresh
      activeTab.value = 'history'
      toast.show('Picking list berhasil dibuat.', 'success') // Pesan sukses untuk alur CSV
      await nextTick() // Tunggu DOM update/tab switch
      await loadHistory() // Muat riwayat agar list baru muncul segera
    }
  } catch (error) {
    console.error('Error di handleUploadComplete:', error)
    toast.show('Gagal memproses hasil upload.', 'error')
  }
}

// Handler saat komponen ValidationDisplay meng-emit event 'confirm'
async function handleConfirmValidation(itemsToSubmit) {
  if (!validationResults.value?.pickingListId || !itemsToSubmit || itemsToSubmit.length === 0) {
    toast.show('Tidak ada item yang dipilih untuk dikonfirmasi.', 'warning')
    return
  }

  isLoading.value = true
  loadingMessage.value = 'Mengonfirmasi picking list...'
  try {
    const payload = { items: itemsToSubmit } // itemsToSubmit sudah format {sku, qty}
    const response = await confirmPickingList(validationResults.value.pickingListId, payload)

    if (response.success) {
      toast.show(response.message, 'success')
      validationResults.value = null // Kembali ke layar upload
      activeTab.value = 'history' // Pindah ke tab riwayat
      await nextTick()
      await loadHistory()
    } else {
      throw new Error(response.message || 'Konfirmasi di server gagal.')
    }
  } catch (error) {
    toast.show(error.message || 'Gagal mengonfirmasi picking list.', 'error')
  } finally {
    isLoading.value = false
    loadingMessage.value = ''
  }
}

// Handler saat komponen ValidationDisplay meng-emit event 'cancel'
function handleCancelValidation() {
  validationResults.value = null // Kembali ke layar upload form
  const fileInput = document.getElementById('pickingListFileInput') // Asumsi ID ini ada di UploadForm
  if (fileInput) {
    fileInput.value = '' // Reset file input
  }
  // Mungkin perlu state tambahan untuk selectedFile jika dikelola di sini
}

// --- History Methods ---
async function loadHistory() {
  isLoadingHistory.value = true
  pickingHistoryList.value = []
  try {
    const responseData = await fetchPickingHistory()
    pickingHistoryList.value = Array.isArray(responseData) ? responseData : []
    if (!Array.isArray(responseData)) {
      toast.show('Gagal memuat riwayat: Format data tidak sesuai.', 'error')
    }
  } catch (error) {
    toast.show(error.message || 'Gagal memuat riwayat.', 'error')
    pickingHistoryList.value = []
  } finally {
    isLoadingHistory.value = false
  }
}

async function openDetailsModal(item) {
  selectedHistoryItem.value = { ...item, details: null, loading: true }
  isDetailsModalOpen.value = true
  try {
    const response = await fetchPickingDetails(item.id)
    if (response.success) {
      selectedHistoryItem.value.details = response.data
    } else {
      toast.show(response.message || `Gagal memuat detail #${item.id}.`, 'error')
      selectedHistoryItem.value.details = []
    }
  } catch (error) {
    toast.show(error.message || `Gagal memuat detail #${item.id}.`, 'error')
    selectedHistoryItem.value.details = []
  } finally {
    selectedHistoryItem.value.loading = false
  }
}

async function handleVoid(pickingListId) {
  console.warn('handleVoid dipanggil, seharusnya handleVoidConfirm dari modal?')
}

async function handleCancelPending(pickingListId) {
  // Pindahkan konfirmasi ke sini jika belum ada modal khusus
  if (
    !confirm(`Anda yakin ingin MEMBATALKAN picking list #${pickingListId} yang belum diproses ini?`)
  ) {
    return
  }
  isLoadingHistory.value = true
  try {
    const response = await cancelPickingList(pickingListId)
    if (response.success) {
      toast.show(response.message, 'success')
      await loadHistory()
    } else {
      toast.show(response.message || 'Gagal membatalkan list.', 'error')
    }
  } catch (error) {
    toast.show(error.message || 'Gagal membatalkan list.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

// Handler untuk event void dari Modal atau tabel
async function executeVoid(pickingListId) {
  isDetailsModalOpen.value = false // Tutup modal jika terbuka
  isLoadingHistory.value = true
  try {
    const response = await voidPickingList(pickingListId)
    if (response.success) {
      toast.show(response.message, 'success')
      await loadHistory()
    } else {
      toast.show(response.message || 'Gagal membatalkan transaksi.', 'error')
    }
  } catch (error) {
    toast.show(error.message || 'Gagal membatalkan transaksi.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

async function handleResume(item) {
  isLoading.value = true
  loadingMessage.value = `Memuat ulang list #${item.id}...`
  validationResults.value = null // Kosongkan dulu

  try {
    const response = await fetchPickingDetails(item.id)

    console.log('[Investigasi Resume] Data dari fetchPickingDetails:', response.data)

    if (!response.success || !Array.isArray(response.data)) {
      throw new Error(response.message || 'Gagal memuat detail item.')
    }

    const validItems = response.data.map((d) => {
      let componentsData = null
      if (d.components && Array.isArray(d.components)) {
        // Map komponen untuk memastikan properti lokasi tersedia
        componentsData = d.components.map((comp) => ({
          ...comp, // Menyimpan properti komponen lain (sku, name, qty_needed)
          // Secara eksplisit menambahkan properti lokasi & stok komponen:
          availableLocations: comp.availableLocations || [],
          suggestedLocationId: comp.suggestedLocationId || null,
        }))
      }

      return {
        sku: d.sku,
        name: d.name,
        qty: d.qty,
        is_package: d.is_package || false,
        current_stock: d.current_stock_display || 0,
        components: componentsData,
        availableLocations: d.availableLocations || [],
        suggestedLocationId: d.suggestedLocationId || null,
      }
    })

    activeTab.value = 'upload'
    await nextTick()

    validationResults.value = {
      pickingListId: item.id,
      validItems: validItems,
      invalidSkus: [], // Kita tidak bisa tahu SKU yg tidak valid dari endpoint ini
    }

    toast.show(`Berhasil memuat ulang list #${item.id}. Silakan periksa & konfirmasi.`, 'success')
  } catch (error) {
    toast.show(error.message || 'Gagal memuat ulang list.', 'error')
    validationResults.value = null // Gagal, jangan tampilkan apa-apa
  } finally {
    isLoading.value = false
    loadingMessage.value = ''
  }
}

// --- Lifecycle ---
watch(
  activeTab,
  (newTab, oldTab) => {
    if (oldTab === 'upload' && newTab !== 'upload') {
      validationResults.value = null // Reset validasi
      // Reset file input di child (jika perlu)
      const fileInput = document.getElementById('pickingListFileInput')
      if (fileInput) {
        fileInput.value = ''
      }
    }

    if (newTab === 'history') {
      loadHistory()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-bold text-text">Proses Picking List</h2>
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 relative">
      <div
        v-if="isLoading"
        class="absolute inset-0 bg-black/30 flex items-center justify-center rounded-xl z-20"
      >
        <div class="bg-background p-4 rounded-lg shadow-lg flex items-center gap-3">
          <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-xl" />
          <span class="text-sm text-text/80">{{ loadingMessage || 'Memproses...' }}</span>
        </div>
      </div>

      <Tabs
        :tabs="[
          { label: 'Upload Baru', value: 'upload' },
          { label: 'Riwayat Proses', value: 'history' },
        ]"
        v-model:model-value="activeTab"
        class="mb-6"
      />

      <div v-if="activeTab === 'upload'">
        <PickingUploadForm
          :is-loading="isLoading"
          :loading-message="loadingMessage"
          @upload-complete="handleUploadComplete"
          v-if="!validationResults"
        />

        <PickingValidationDisplay
          v-else
          :validation-results="validationResults"
          :is-loading="isLoading"
          :loading-message="loadingMessage"
          @cancel="handleCancelValidation"
          @confirm="handleConfirmValidation"
        />
      </div>

      <div v-if="activeTab === 'history'">
        <PickingHistoryTable
          :history-items="pickingHistoryList"
          :is-loading="isLoadingHistory"
          @refresh="loadHistory"
          @view-details="openDetailsModal"
          @void-item="executeVoid"
          @cancel-item="handleCancelPending"
          @resume-item="handleResume"
        />
      </div>
    </div>

    <PickingListDetailsModal
      :show="isDetailsModalOpen"
      :item="selectedHistoryItem"
      @close="isDetailsModalOpen = false"
      @void-confirmed="executeVoid"
    />
  </div>
</template>
