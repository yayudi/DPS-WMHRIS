<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/UseToast.js'
import { useWms } from '@/composables/useWms.js'
import { transferStock, adjustStock } from '@/api/helpers/stock.js'
import WmsProductTable from '@/components/WmsProductTable.vue'
import WmsControlPanel from '@/components/WmsControlPanel.vue'
import WmsAdjustModal from '@/components/WMSAdjustModal.vue'
import WmsTransferModal from '@/components/WMSTransferModal.vue'
import WmsHistoryModal from '@/components/WMSHistoryModal.vue'
import { useAuthStore } from '@/stores/auth.js'

const {
  activeView,
  displayedProducts,
  loading,
  error,
  loader,
  searchBy,
  showMinusStockOnly,
  hasMoreData,
  searchPlaceholder,
  handleSearchInput,
  selectedBuilding,
  selectedFloor,
  sortBy,
  sortOrder,
  handleSort,
  allLocations,
  isAutoRefetching,
  toggleAutoRefetch,
  resetAndRefetch,
  sseStatus,
  recentlyUpdatedProducts,
} = useWms()

// ✅ 2. Inisialisasi auth store
const auth = useAuthStore()
const { show } = useToast()
const isHistoryModalOpen = ref(false)
const isTransferModalOpen = ref(false)
const isUploadModalOpen = ref(false)
const isAdjustModalOpen = ref(false)
const selectedProduct = ref(null)
const transferAmount = ref(1)
const adjustAmount = ref(0)
const adjustReason = ref('')
const searchTerm = ref('')

const warehouseViews = [
  { label: 'Semua', value: 'all' },
  { label: 'Gudang', value: 'gudang' },
  { label: 'Pajangan', value: 'pajangan' },
  { label: 'LTC', value: 'ltc' },
]

const searchTabs = [
  { label: 'Nama', value: 'name' },
  { label: 'SKU', value: 'sku' },
]

const buildingFilterOptions = [
  { label: 'Semua Gedung', value: 'all' },
  { label: 'A19', value: 'A19' },
  { label: 'A20', value: 'A20' },
  { label: 'B16', value: 'B16' },
  { label: 'OASIS', value: 'OASIS' },
]

const floorFilterOptions = [
  { label: 'Semua Lantai', value: 'all' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' },
]

function copyToClipboard({ text, fieldName }) {
  if (!text) return
  // Gunakan document.execCommand untuk kompatibilitas iframe
  const textArea = document.createElement('textarea')
  textArea.value = text
  document.body.appendChild(textArea)
  textArea.select()
  try {
    document.execCommand('copy')
    show(`${fieldName} disalin ke clipboard!`, 'success')
  } catch (err) {
    console.error('Gagal menyalin:', err)
    show('Gagal menyalin teks.', 'error')
  }
  document.body.removeChild(textArea)
}

function openTransferModal(product) {
  selectedProduct.value = product
  isTransferModalOpen.value = true
  transferAmount.value = 1
}

function openAdjustModal(product) {
  selectedProduct.value = product
  isAdjustModalOpen.value = true
  adjustAmount.value = 0
  adjustReason.value = ''
}

function openHistoryModal(product) {
  selectedProduct.value = product
  isHistoryModalOpen.value = true
}

// Fungsi-fungsi ini sekarang tidak terpakai di WMS.vue
// function openBatchLogModal() {
//   isBatchLogModalOpen.value = true
// }

// function openBatchMovementModal() {
//   isBatchMovementModalOpen.value = true
// }

function closeModal() {
  isHistoryModalOpen.value = false
  isTransferModalOpen.value = false
  // isBatchLogModalOpen.value = false
  // isBatchMovementModalOpen.value = false
  isUploadModalOpen.value = false
  isAdjustModalOpen.value = false
  selectedProduct.value = null
}

async function handleTransferConfirm(payload) {
  try {
    show('Memproses transfer...', 'info')
    const response = await transferStock(payload)
    if (response.success) {
      show('Transfer stok berhasil!', 'success')
    }
  } catch (err) {
    show(err.message || 'Gagal transfer.', 'error')
  } finally {
    closeModal()
  }
}

async function handleAdjustConfirm(payload) {
  try {
    show('Memproses penyesuaian...', 'info')
    const response = await adjustStock(payload)
    if (response.success) {
      show('Penyesuaian stok berhasil!', 'success')
    }
  } catch (err) {
    show(err.message || 'Gagal penyesuaian.', 'error')
  } finally {
    closeModal()
  }
}
</script>

<template>
  <div class="bg-secondary/20 min-h-screen p-4 sm:p-6">
    <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <h2 class="text-2xl font-bold text-text flex items-center gap-3">
        <font-awesome-icon icon="fa-solid fa-warehouse" />
        <span>Warehouse Management</span>
      </h2>

      <!-- ✅ 3. BAGIAN TOMBOL DIPERBARUI DENGAN RCAB -->
      <div class="flex items-center gap-3">
        <!-- Tombol 1: Perpindahan (Movement) -->
        <router-link
          v-if="auth.hasPermission('perform-batch-movement')"
          to="/wms/actions/batch-movement"
          class="px-4 py-2 text-sm font-semibold bg-primary/10 text-primary rounded-lg hover:bg-primary/30 transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
          <span>Perpindahan Stok</span>
        </router-link>

        <!-- Tombol 2: Penyesuaian (Adjustment) - BARU -->
        <router-link
          v-if="auth.hasPermission('manage-stock-adjustment')"
          to="/wms/actions/batch-adjustment"
          class="px-4 py-2 text-sm font-semibold bg-amber-500/10 text-amber-600 rounded-lg hover:bg-amber-500/30 transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-calculator" />
          <span>Penyesuaian Stok</span>
        </router-link>
      </div>
    </div>

    <!-- Panel Kontrol Utama -->
    <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
      <WmsControlPanel
        :search-placeholder="searchPlaceholder"
        :search-tabs="searchTabs"
        :warehouse-views="warehouseViews"
        :building-filter-options="buildingFilterOptions"
        :floor-filter-options="floorFilterOptions"
        :is-auto-refetching="isAutoRefetching"
        :sse-status="sseStatus"
        @search="handleSearchInput"
        @toggle-refetch="toggleAutoRefetch"
        v-model:search-by="searchBy"
        v-model:searchValue="searchTerm"
        v-model:active-view="activeView"
        v-model:show-minus-stock-only="showMinusStockOnly"
        v-model:selected-building="selectedBuilding"
        v-model:selected-floor="selectedFloor"
      />

      <div v-if="loading" class="text-center py-16">
        <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-3xl" />
        <p class="mt-3 text-text/70 text-sm">Memuat data produk...</p>
      </div>

      <div v-else-if="error" class="text-center py-16">
        <font-awesome-icon icon="fa-solid fa-exclamation-triangle" class="text-accent text-3xl" />
        <p class="mt-3 font-semibold text-text">Gagal Memuat Data</p>
        <p class="text-sm text-text/70">{{ error }}</p>
      </div>

      <div v-else class="overflow-x-auto">
        <WmsProductTable
          :products="displayedProducts"
          :active-view="activeView"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          :recently-updated-products="recentlyUpdatedProducts"
          @copy="copyToClipboard"
          @openTransfer="openTransferModal"
          @openAdjust="openAdjustModal"
          @openHistory="openHistoryModal"
          @sort="handleSort"
        />

        <div ref="loader" class="text-center py-6">
          <span v-if="displayedProducts.length === 0 && !loading" class="text-text/50 text-sm">
            -- Tidak ada produk yang cocok --
          </span>
          <span v-else-if="hasMoreData" class="text-text/50 text-sm"> Memuat lebih banyak... </span>
          <span v-else class="text-text/50 text-sm"> -- Akhir dari daftar -- </span>
        </div>
      </div>
    </div>
  </div>

  <WmsTransferModal
    :show="isTransferModalOpen"
    :product="selectedProduct"
    :locations="allLocations"
    @close="closeModal"
    @confirm="handleTransferConfirm"
  />

  <WmsAdjustModal
    :show="isAdjustModalOpen"
    :product="selectedProduct"
    :locations="allLocations"
    @close="closeModal"
    @confirm="handleAdjustConfirm"
  />

  <WmsHistoryModal :show="isHistoryModalOpen" :product="selectedProduct" @close="closeModal" />
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
