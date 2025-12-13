<!-- frontend\src\views\WMS.vue -->
<script setup>
import { ref } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useWms } from '@/composables/useWms.js'
import { transferStock, adjustStock } from '@/api/helpers/stock.js'
import axios from '@/api/axios.js'
import WmsProductTable from '@/components/wms/shared/ProductTable.vue'
import WmsControlPanel from '@/components/wms/shared/ControlPanel.vue'
import WmsAdjustModal from '@/components/wms/shared/AdjustModal.vue'
import WmsTransferModal from '@/components/wms/transfer/TransferModal.vue'
import WmsHistoryModal from '@/components/wms/shared/HistoryModal.vue'
import WmsProductFormModal from '@/components/wms/shared/ProductFormModal.vue'
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
  // recentlyUpdatedProducts,
  fetchProducts,
} = useWms()

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
const isProductFormOpen = ref(false)
const productFormMode = ref('create')

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
  { label: 'Lantai 1', value: '1' },
  { label: 'Lantai 2', value: '2' },
  { label: 'Lantai 3', value: '3' },
  { label: 'Lantai 4', value: '4' },
]

function copyToClipboard({ text, fieldName }) {
  if (!text) return
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

// Master Data Functions
function openCreateProductModal() {
  productFormMode.value = 'create'
  selectedProduct.value = null
  isProductFormOpen.value = true
}

function openEditProductModal(product) {
  productFormMode.value = 'edit'
  selectedProduct.value = product
  isProductFormOpen.value = true
}

async function handleDeleteProduct(product) {
  if (!confirm(`Yakin ingin menghapus "${product.name}"?`)) return
  try {
    const response = await axios.delete(`/products/${product.id}`)
    if (response.data.success) {
      show('Produk berhasil dihapus', 'success')
      resetAndRefetch() // Refresh list
    }
  } catch (err) {
    show(err.response?.data?.message || 'Gagal menghapus produk', 'error')
  }
}

function handleProductSaved() {
  resetAndRefetch() // Refresh list after create/edit
}

function closeModal() {
  isHistoryModalOpen.value = false
  isTransferModalOpen.value = false
  isUploadModalOpen.value = false
  isAdjustModalOpen.value = false
  isProductFormOpen.value = false // ✅ Close form
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
  <div class="min-h-screen p-4 sm:p-6">
    <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-2xl font-bold text-text flex items-center gap-3">
          <font-awesome-icon icon="fa-solid fa-warehouse" class="text-primary" />
          <span>Warehouse Management</span>
        </h2>
        <p class="text-text/60 text-sm mt-1 ml-9">Monitor stok, mutasi, dan opname.</p>
      </div>

      <!-- ACTION BUTTON GROUP -->
      <div
        class="bg-secondary/25 p-1.5 rounded-xl border border-secondary/20 shadow-sm flex gap-2 overflow-x-auto max-w-full items-center"
      >
        <!-- Tombol 1: Perpindahan -->
        <router-link
          v-if="auth.hasPermission('perform-batch-movement')"
          to="/wms/actions/batch-movement"
          class="px-4 py-2 text-sm font-bold text-accent hover:bg-accent/10 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap"
          title="Pindah Stok Antar Lokasi"
        >
          <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
          <span>Pindah</span>
        </router-link>

        <div class="w-px h-6 bg-primary"></div>

        <!-- Tombol 2: Penyesuaian -->
        <router-link
          v-if="auth.hasPermission('manage-stock-adjustment')"
          to="/wms/actions/batch-adjustment"
          class="px-4 py-2 text-sm font-bold text-warning hover:bg-warning/10 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap"
          title="Stock Opname / Penyesuaian"
        >
          <font-awesome-icon icon="fa-solid fa-calculator" />
          <span>Opname</span>
        </router-link>

        <div class="w-px h-6 bg-primary"></div>

        <!-- Tombol 3: Retur -->
        <router-link
          v-if="auth.hasPermission('manage-stock-adjustment')"
          to="/wms/actions/return"
          class="px-4 py-2 text-sm font-bold text-danger hover:bg-danger/10 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap"
          title="Validasi Barang Retur"
        >
          <font-awesome-icon icon="fa-solid fa-rotate-left" />
          <span>Retur</span>
        </router-link>

        <!-- Tambah 4: Produk -->
        <div v-if="auth.hasPermission('manage-products')" class="w-px h-6 bg-primary"></div>
        <button
          v-if="auth.hasPermission('manage-products')"
          @click="openCreateProductModal"
          class="px-4 py-2 text-sm font-bold text-success hover:bg-success/10 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap"
          title="Tambah Produk Baru"
        >
          <font-awesome-icon icon="fa-solid fa-plus" />
          <span>Produk</span>
        </button>
      </div>
    </div>

    <!-- Panel Kontrol Utama -->
    <div class="bg-secondary/25 rounded-xl shadow-md border border-secondary/20 p-6 space-y-6">
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
          @copy="copyToClipboard"
          @openTransfer="openTransferModal"
          @openAdjust="openAdjustModal"
          @openHistory="openHistoryModal"
          @openEdit="openEditProductModal"
          @delete="handleDeleteProduct"
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

  <!-- Master Data Modal -->
  <WmsProductFormModal
    :show="isProductFormOpen"
    :mode="productFormMode"
    :product-data="selectedProduct"
    @close="closeModal"
    @refresh="handleProductSaved"
  />
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
