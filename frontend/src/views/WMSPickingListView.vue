<!-- frontend\src\views\WMSPickingListView.vue -->
<script setup>
import { ref, watch, computed } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import {
  uploadPickingList,
  confirmPickingList,
  fetchPickingHistory,
  voidPickingList,
} from '@/api/helpers/picking.js'
import Tabs from '@/components/Tabs.vue'
import PickingListDetailsModal from '@/components/PickingListDetailsModal.vue'

const { show } = useToast()
const activeTab = ref('upload')
const source = ref('Tokopedia')
const selectedFile = ref(null)
const isLoading = ref(false)
const validationData = ref(null)
const itemsToProcess = ref([])
const history = ref([])
const isLoadingHistory = ref(false)
const isDetailsModalOpen = ref(false)
const selectedHistoryItem = ref(null)
const allValidItemsSelected = computed({
  get() {
    if (!validationData.value || validationData.value.validItems.length === 0) {
      return false
    }
    return itemsToProcess.value.length === validationData.value.validItems.length
  },
  set(value) {
    if (value) {
      itemsToProcess.value = [...validationData.value.validItems]
    } else {
      itemsToProcess.value = []
    }
  },
})

function handleFileChange(event) {
  selectedFile.value = event.target.files[0]
}

async function handleUpload() {
  if (!selectedFile.value) {
    show('Silakan pilih file picking list terlebih dahulu.', 'warning')
    return
  }

  isLoading.value = true
  validationData.value = null
  itemsToProcess.value = []

  const formData = new FormData()
  formData.append('pickingListFile', selectedFile.value)
  formData.append('source', source.value)

  try {
    const response = await uploadPickingList(formData)
    if (response.success) {
      validationData.value = response.data
      // Secara default, pilih semua item yang stoknya mencukupi
      itemsToProcess.value = response.data.validItems.filter(
        (item) => item.current_stock >= item.qty,
      )
      show('File berhasil diparsing. Silakan validasi data.', 'info')
    }
  } catch (error) {
    show(error.message || 'Gagal mengupload file.', 'error')
  } finally {
    isLoading.value = false
    // Reset input file agar bisa upload file yang sama lagi
    const fileInput = document.querySelector('input[type="file"]')
    if (fileInput) fileInput.value = ''
    selectedFile.value = null
  }
}

async function handleConfirm() {
  if (itemsToProcess.value.length === 0) {
    show('Pilih setidaknya satu item untuk diproses.', 'warning')
    return
  }

  isLoading.value = true
  try {
    // Kirim hanya item yang dipilih dan kuantitasnya yang mungkin sudah diedit
    const payload = itemsToProcess.value.map((item) => ({ sku: item.sku, qty: item.qty }))
    const response = await confirmPickingList(validationData.value.pickingListId, payload)
    if (response.success) {
      show(response.message, 'success')
      // Kembali ke layar upload awal setelah berhasil
      validationData.value = null
      itemsToProcess.value = []
    }
  } catch (error) {
    show(error.message || 'Gagal mengonfirmasi picking list.', 'error')
  } finally {
    isLoading.value = false
  }
}

function cancelValidation() {
  validationData.value = null
}

function openDetailsModal(historyItem) {
  selectedHistoryItem.value = historyItem
  isDetailsModalOpen.value = true
}

async function handleVoidConfirm(pickingListId) {
  isDetailsModalOpen.value = false // Tutup modal dulu
  isLoadingHistory.value = true // Tampilkan loading di tabel riwayat
  try {
    const response = await voidPickingList(pickingListId)
    show(response.message, 'success')
    // Muat ulang riwayat untuk menampilkan status 'CANCELLED' yang baru
    history.value = await fetchPickingHistory()
  } catch (error) {
    show(error.message || 'Gagal membatalkan transaksi.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

async function loadHistory() {
  isLoadingHistory.value = true
  try {
    history.value = await fetchPickingHistory()
  } catch (error) {
    show('Gagal memuat riwayat.', 'error')
  } finally {
    isLoadingHistory.value = false
  }
}

watch(
  activeTab,
  async (newTab) => {
    if (newTab === 'history') {
      isLoadingHistory.value = true
      try {
        history.value = await fetchPickingHistory()
      } catch (error) {
        show('Gagal memuat riwayat.', 'error')
      } finally {
        isLoadingHistory.value = false
      }
    }
  },
  { immediate: true },
)
</script>
<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-2xl font-bold text-text">Proses Picking List</h2>
      <router-link to="/wms" class="text-sm text-primary hover:underline"
        >&larr; Kembali ke WMS</router-link
      >
    </div>

    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6">
      <Tabs
        :tabs="[
          { label: 'Upload Baru', value: 'upload' },
          { label: 'Riwayat Proses', value: 'history' },
        ]"
        v-model:model-value="activeTab"
        class="mb-6"
      />

      <!-- Tampilan untuk Tab "Upload Baru" -->
      <div v-if="activeTab === 'upload'">
        <!-- Layar Validasi Interaktif -->
        <div v-if="validationData" class="space-y-6">
          <h3 class="text-lg font-semibold text-text">Validasi Data Picking List</h3>

          <div v-if="validationData.invalidSkus.length > 0" class="bg-accent/10 p-4 rounded-lg">
            <h4 class="font-bold text-accent">SKU Tidak Ditemukan!</h4>
            <p class="text-sm text-accent/80">
              SKU berikut tidak ada di database dan akan diabaikan:
            </p>
            <ul class="list-disc list-inside text-sm font-mono mt-2">
              <li v-for="sku in validationData.invalidSkus" :key="sku">{{ sku }}</li>
            </ul>
          </div>

          <div class="max-h-96 overflow-y-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-secondary/10 sticky top-0">
                <tr>
                  <th class="p-2 w-12">
                    <input
                      type="checkbox"
                      v-model="allValidItemsSelected"
                      title="Pilih Semua Item Valid"
                    />
                  </th>
                  <th class="p-2 text-left">SKU</th>
                  <th class="p-2 text-left">Nama Produk</th>
                  <th class="p-2 text-center">Stok Pajangan</th>
                  <th class="p-2 text-center">Qty Ambil</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-secondary/20">
                <tr
                  v-for="item in validationData.validItems"
                  :key="item.sku"
                  :class="{ 'bg-red-500/10': item.current_stock < item.qty }"
                >
                  <td class="p-2 text-center">
                    <input type="checkbox" :value="item" v-model="itemsToProcess" />
                  </td>
                  <td class="p-2 font-mono">{{ item.sku }}</td>
                  <td class="p-2">{{ item.name }}</td>
                  <td
                    class="p-2 text-center font-semibold"
                    :class="{ 'text-accent': item.current_stock < item.qty }"
                  >
                    {{ item.current_stock }}
                  </td>
                  <td class="p-2 text-center">
                    <input
                      type="number"
                      v-model.number="item.qty"
                      min="0"
                      class="w-20 text-center font-bold bg-background border rounded p-1"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex justify-between items-center pt-6 border-t border-secondary/20">
            <span class="text-sm font-semibold text-text/80"
              >{{ itemsToProcess.length }} dari {{ validationData.validItems.length }} item dipilih
              untuk diproses.</span
            >
            <div class="flex gap-4">
              <button @click="cancelValidation" class="btn-secondary">Batal</button>
              <button
                @click="handleConfirm"
                :disabled="isLoading || itemsToProcess.length === 0"
                class="btn-primary flex items-center gap-2"
              >
                <font-awesome-icon
                  v-if="isLoading"
                  icon="fa-solid fa-spinner"
                  class="animate-spin"
                />
                <span>{{ isLoading ? 'Memproses...' : 'Konfirmasi & Kurangi Stok' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Form Upload Awal -->
        <div v-else class="space-y-4 max-w-lg mx-auto">
          <div>
            <label class="block text-sm font-medium text-text/90 mb-2">Pilih Sumber</label>
            <Tabs
              :tabs="[
                { label: 'Tokopedia', value: 'Tokopedia' },
                { label: 'Shopee', value: 'Shopee' },
                { label: 'Offline', value: 'Offline' },
              ]"
              v-model:model-value="source"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-text/90 mb-2"
              >Pilih File (PDF, CSV, Teks)</label
            >
            <input
              type="file"
              @change="handleFileChange"
              accept=".pdf,.csv,.txt"
              class="block w-full text-sm text-text/80 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
          </div>
          <div class="pt-4">
            <button
              @click="handleUpload"
              :disabled="isLoading"
              class="w-full px-6 py-3 bg-accent text-white rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
              <span>{{ isLoading ? 'Memproses File...' : 'Upload & Validasi' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Tampilan untuk Tab "Riwayat Proses" -->
      <div v-if="activeTab === 'history'">
        <div v-if="isLoadingHistory" class="text-center p-8">Memuat riwayat...</div>
        <table v-else class="min-w-full text-sm">
          <thead class="bg-secondary/10">
            <tr>
              <th class="p-2 text-left">Waktu Proses</th>
              <th class="p-2 text-left">Nama File</th>
              <th class="p-2 text-left">Sumber</th>
              <th class="p-2 text-left">Status</th>
              <th class="p-2 text-left">Oleh</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/20">
            <!-- --- PERBAIKAN: Tambahkan @click di sini --- -->
            <tr
              v-for="item in history"
              :key="item.id"
              class="hover:bg-primary/10 cursor-pointer"
              @click="openDetailsModal(item)"
            >
              <td class="p-2">{{ new Date(item.created_at).toLocaleString('id-ID') }}</td>
              <td class="p-2">{{ item.original_filename }}</td>
              <td class="p-2">{{ item.source }}</td>
              <td class="p-2">
                <span
                  :class="{
                    'text-green-600': item.status === 'COMPLETED',
                    'text-yellow-600': item.status === 'PENDING_VALIDATION',
                    'text-red-600': item.status === 'CANCELLED',
                  }"
                  class="font-semibold"
                  >{{ item.status }}</span
                >
              </td>
              <td class="p-2">{{ item.username }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <PickingListDetailsModal
      :show="isDetailsModalOpen"
      :list="selectedHistoryItem"
      @close="isDetailsModalOpen = false"
      @void-confirmed="handleVoidConfirm"
    />
  </div>
</template>

<style scoped>
.btn-primary {
  @apply px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold;
}
.btn-secondary {
  @apply px-4 py-2 bg-secondary/20 text-text/80 rounded-lg text-sm font-semibold;
}
</style>
