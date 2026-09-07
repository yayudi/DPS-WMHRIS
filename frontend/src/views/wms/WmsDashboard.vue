<!-- frontend\src\views\wms\WmsDashboard.vue -->
<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import axios from '@/api/axios.js'
import { ref, watch, computed } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useWms } from '@/composables/useWMS.js'
import { useAuthStore } from '@/stores/auth.js'
import { useMagicKeys } from '@vueuse/core'
import { transferStock, adjustStock } from '@/api/helpers/stock.js'
import { useMasterDataStore } from '@/stores/masterData.js'
import { useMobile } from '@/composables/useMobile.js'
import { useClipboard } from '@/composables/useClipboard'
import WmsProductTable from '@/components/wms/shared/ProductTable.vue'
import WmsControlPanel from '@/components/wms/shared/WmsControlPanel.vue'
import WmsAdjustModal from '@/components/wms/shared/AdjustModal.vue'
import WmsActionHeader from '@/components/wms/shared/WmsActionHeader.vue'
import WmsTransferModal from '@/components/wms/transfer/TransferModal.vue'
import WmsHistoryModal from '@/components/wms/shared/HistoryModal.vue'
import WmsProductFormModal from '@/components/wms/shared/ProductFormModal.vue'
import SalesSimulationModal from '@/components/wms/shared/SalesSimulationModal.vue'
import ProductImageModal from '@/components/products/ProductImageModal.vue'
import StickerGeneratorModal from '@/components/utilities/StickerGeneratorModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'

const { isMobile } = useMobile()
const {
  activeView,
  displayedProducts,
  loading,
  isBackgroundLoading,
  error,
  loader,
  searchBy,
  stockStatusFilter,
  productTypeFilter,
  hasMoreData,
  searchPlaceholder,
  handleSearchInput,
  selectedBuilding,
  selectedFloor,
  selectedCategory,
  sortBy,
  sortOrder,
  handleSort,
  allLocations,
  isAutoRefetching,
  toggleAutoRefetch,
  visibleColumns,
  availableColumns,
  toggleColumn,
  resetAndRefetch,
  viewMode,
  currentPage,
  totalPages,
  totalProducts,
  pageSize,
  goToPage,
  changePageSize
} = useWms()

const auth = useAuthStore()
const { toast } = useToast()
const { copyToClipboard } = useClipboard()

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
const productFormMode = ref('edit')
const isSimulationModalOpen = ref(false)
const isStickerModalOpen = ref(false)
const selectedStickerProduct = ref(null)
const mobileLayout = ref(isMobile.value ? 'card' : 'compact')
const categoryOptions = ref([])
const masterData = useMasterDataStore()

async function loadCategories() {
  try {
    const categories = await masterData.getCategories()
    categoryOptions.value = categories.map(c => ({ id: c.id, label: c.name }))
  } catch {
    toast('Gagal memuat kategori dari server', 'error')
  }
}

watch(isMobile, mobile => {
  mobileLayout.value = mobile ? 'card' : 'compact'
})

// Panggil saat load
import { onMounted } from 'vue'
onMounted(() => {
  loadCategories()
})

// Image Modal State
const isImageModalOpen = ref(false)
const selectedImageProduct = ref(null)

const warehouseViews = [
  { label: 'Semua', value: 'all' },
  { label: 'Gudang', value: 'gudang' },
  { label: 'Pajangan', value: 'pajangan' },
  { label: 'LTC', value: 'ltc' }
]

const searchTabs = [
  { label: 'Nama', value: 'name' },
  { label: 'SKU', value: 'sku' }
]

const buildingFilterOptions = [
  { label: 'A19', value: 'A19' },
  { label: 'A20', value: 'A20' },
  { label: 'B16', value: 'B16' },
  { label: 'OASIS', value: 'OASIS' }
]

const floorFilterOptions = [
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' }
]

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

function openStickerModal(product = null) {
  selectedStickerProduct.value = product
  isStickerModalOpen.value = true
}

// Master Data Functions
function openEditProductModal(product) {
  productFormMode.value = 'edit'
  selectedProduct.value = product
  isProductFormOpen.value = true
}

async function handleDeleteProduct(product) {
  if (!(await swalConfirm(`Yakin ingin menghapus "${product.name}"?`))) return
  try {
    const response = await axios.delete(`/products/${product.id}`)
    if (response.data.success) {
      toast('Produk berhasil dihapus', 'success')
      resetAndRefetch() // Refresh list
    }
  } catch (err) {
    console.error(err) // Auto-added to prevent unused var
  }
}

function openImageModal(product) {
  selectedImageProduct.value = product
  isImageModalOpen.value = true
}

function handleProductSaved() {
  resetAndRefetch() // Refresh list after create/edit
}

function closeModal() {
  isHistoryModalOpen.value = false
  isTransferModalOpen.value = false
  isUploadModalOpen.value = false
  isAdjustModalOpen.value = false
  isProductFormOpen.value = false
  isProductFormOpen.value = false
  isSimulationModalOpen.value = false
  isImageModalOpen.value = false
  isStickerModalOpen.value = false
  selectedProduct.value = null
  selectedStickerProduct.value = null
}

async function handleTransferConfirm(payload) {
  try {
    toast('Memproses transfer...', 'info')
    const response = await transferStock(payload)
    if (response.success) {
      toast('Transfer stok berhasil!', 'success')
    }
  } catch (err) {
    console.error(err) // Auto-added to prevent unused var
  } finally {
    closeModal()
  }
}

async function handleAdjustConfirm(payload) {
  try {
    toast('Memproses penyesuaian...', 'info')
    const response = await adjustStock(payload)
    if (response.success) {
      toast('Penyesuaian stok berhasil!', 'success')
    }
  } catch (err) {
    console.error(err) // Auto-added to prevent unused var
  } finally {
    closeModal()
  }
}

const { Slash, Escape } = useMagicKeys()

const anyModalOpen = computed(() => {
  return (
    isHistoryModalOpen.value ||
    isTransferModalOpen.value ||
    isUploadModalOpen.value ||
    isAdjustModalOpen.value ||
    isProductFormOpen.value ||
    isSimulationModalOpen.value ||
    isImageModalOpen.value ||
    isStickerModalOpen.value
  )
})

watch(Slash, pressed => {
  if (pressed && !anyModalOpen.value) {
    setTimeout(() => {
      const el = document.getElementById('global-search-input')
      if (el) el.focus()
    }, 10)
  }
})

watch(Escape, pressed => {
  if (pressed) {
    closeModal()
  }
})
</script>

<template>
  <WmsActionHeader
    title="Warehouse <span class='text-primary'>Management</span>"
    icon="fa-solid fa-warehouse"
    class="mb-[1vh]"
  >
    <template #actions>
      <div
        v-if="auth.hasPermission('perform-batch-movement')"
        class="bg-secondary/35 p-1.5 rounded-xl border border-secondary/20 shadow-sm flex gap-3 overflow-x-auto items-center custom-scrollbar"
        :class="isMobile ? 'w-full justify-center' : ''"
      >
        <router-link
          to="/wms/actions/batch-movement"
          class="w-1/2 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10 rounded-lg transition-all flex items-center gap-2 justify-center whitespace-nowrap"
          title="Pindah Stok Antar Lokasi"
        >
          <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
          <span>Pindah</span>
        </router-link>
        <div v-if="!isMobile" class="w-px h-6 bg-primary"></div>
        <button
          @click="openStickerModal(null)"
          class="w-1/2 px-4 py-2 text-sm font-bold text-accent hover:bg-accent/10 rounded-lg transition-all flex items-center gap-2 justify-center whitespace-nowrap"
          title="Batch Sticker Generator"
        >
          <font-awesome-icon icon="fa-solid fa-print" />
          <span>Sticker</span>
        </button>
        <div v-if="!isMobile" class="w-px h-6 bg-primary"></div>
        <button
          v-if="auth.hasPermission('view-prices')"
          @click="isSimulationModalOpen = true"
          class="w-1/2 px-4 py-2 text-sm font-bold text-success hover:bg-success/10 rounded-lg transition-all flex items-center gap-2 justify-center whitespace-nowrap"
          title="Simulasi Harga & Berat"
        >
          <font-awesome-icon icon="fa-solid fa-calculator" />
          <span>Simulasi</span>
        </button>
      </div>
    </template>
  </WmsActionHeader>

  <!-- Panel Kontrol Utama -->
  <div class="bg-secondary/35 rounded-xl shadow-lg border border-secondary/20 p-2 lg:px-6 lg:pb-6 space-y-2 w-full">
    <WmsControlPanel
      class="sticky top-14"
      :search-placeholder="searchPlaceholder"
      :search-tabs="searchTabs"
      :warehouse-views="warehouseViews"
      :building-filter-options="buildingFilterOptions"
      :floor-filter-options="floorFilterOptions"
      :category-filter-options="categoryOptions"
      :is-auto-refetching="isAutoRefetching"
      @search="handleSearchInput"
      @toggle-refetch="toggleAutoRefetch"
      v-model:search-by="searchBy"
      v-model:searchValue="searchTerm"
      v-model:active-view="activeView"
      v-model:stock-status-filter="stockStatusFilter"
      v-model:product-type-filter="productTypeFilter"
      v-model:selected-building="selectedBuilding"
      v-model:selected-floor="selectedFloor"
      v-model:selected-category="selectedCategory"
      v-model:mobileLayout="mobileLayout"
      v-model:viewMode="viewMode"
      :available-columns="availableColumns"
      :visible-columns="visibleColumns"
      @toggle-column="toggleColumn"
    />

    <div v-if="loading" class="text-center py-16">
      <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-3xl" />
      <p class="text-text/70 text-sm">Memuat data produk...</p>
    </div>

    <div v-else-if="error" class="text-center py-16">
      <font-awesome-icon icon="fa-solid fa-exclamation-triangle" class="text-accent text-3xl" />
      <p class="font-semibold text-text">Gagal Memuat Data</p>
      <p class="text-sm text-text/70">{{ error }}</p>
    </div>

    <div v-else class="overflow-x-auto">
      <WmsProductTable
        :products="displayedProducts"
        :active-view="activeView"
        :sort-by="sortBy"
        :sort-order="sortOrder"
        :loading="loading"
        :mobile-layout="mobileLayout"
        @copy="copyToClipboard"
        @openTransfer="openTransferModal"
        @openAdjust="openAdjustModal"
        @openHistory="openHistoryModal"
        @openEdit="openEditProductModal"
        @delete="handleDeleteProduct"
        @sort="handleSort"
        :visible-columns="visibleColumns"
        @view-image="openImageModal"
        @openSticker="openStickerModal"
      >
        <template #footer>
          <div
            v-if="viewMode === 'pagination'"
            class="border-t border-secondary/20 bg-background sticky bottom-0 z-40 left-0 min-w-max md:min-w-full"
          >
            <BasePagination
              :pagination="{
                page: currentPage,
                limit: pageSize,
                total: totalProducts,
                totalPages: totalPages
              }"
              :show-limit-picker="true"
              @changePage="goToPage"
              @update:limit="changePageSize"
              :limit-options="[25, 50, 75, 108]"
            />
          </div>
          <div v-else ref="loader" class="text-center pt-6 pb-2">
            <span v-if="displayedProducts.length === 0 && !loading" class="text-text/50 text-sm">
              -- Tidak ada produk yang cocok --
            </span>
            <span v-else-if="hasMoreData" class="text-text/50 text-sm"> Memuat lebih banyak... </span>
            <span v-else class="text-text/50 text-sm"> -- Akhir dari daftar -- </span>
          </div>
        </template>
      </WmsProductTable>
    </div>
  </div>

  <!-- Silent Update Indicator -->
  <transition name="fade">
    <div
      v-if="isBackgroundLoading"
      class="fixed bottom-6 right-6 z-50 bg-background/80 backdrop-blur-md border border-primary/20 text-primary px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 pointer-events-none"
    >
      <font-awesome-icon icon="fa-solid fa-sync" class="animate-spin" />
      <span>Mengupdate Data...</span>
    </div>
  </transition>

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

  <SalesSimulationModal :show="isSimulationModalOpen" @close="isSimulationModalOpen = false" />

  <!-- Image Modal -->
  <ProductImageModal
    :show="isImageModalOpen"
    :product-data="selectedImageProduct"
    @close="isImageModalOpen = false"
    @refresh="resetAndRefetch"
  />

  <StickerGeneratorModal :show="isStickerModalOpen" :initialProduct="selectedStickerProduct" @close="closeModal" />
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

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
