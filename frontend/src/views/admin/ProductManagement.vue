<!-- frontend/src/views/admin/ProductManagement.vue -->
<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, computed, watch, onMounted } from 'vue'
import { useFirebaseSync } from '@/composables/useFirebaseSync'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/composables/useToast.js'
import axios from '@/api/axios.js'
import debounce from 'lodash/debounce'
import { useDownloadStore } from '@/stores/downloadStore.js'
import { useMasterDataStore } from '@/stores/masterData.js'
import BatchEditModal from '@/components/products/BatchEditModal.vue'
import ProductFormModal from '@/components/wms/shared/ProductFormModal.vue'
import ConnectionStatus from '@/components/wms/shared/ConnectionStatus.vue'
import BaseFilterPanel from '@/components/ui/BaseFilterPanel.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useInlineSave } from '@/composables/useInlineSave.js'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import WmsActionHeader from '@/components/wms/shared/WmsActionHeader.vue'
import ProductTable from '@/components/products/ProductTable.vue'
import ProductImageModal from '@/components/products/ProductImageModal.vue'
import StickerGeneratorModal from '@/components/utilities/StickerGeneratorModal.vue'

const { toast } = useToast()
const masterStore = useMasterDataStore()

// --- STATE ---
const products = ref([])
// loading state is now handled by Vue Query
const searchQuery = ref('')
const searchBy = ref('name')
const filterType = ref('all')
const filterStatus = ref('active')
const sortBy = ref('sku')
const sortOrder = ref('desc')
const tableKey = ref(0)

const categoryOptions = ref([])
const filterCategory = ref({ include: [], exclude: [] })

const statusOptions = [
  { id: 'active', label: 'Produk Aktif' },
  { id: 'archived', label: 'Diarsipkan (Hapus)' }
]

const searchByOptions = [
  { id: 'name', label: 'Nama' },
  { id: 'sku', label: 'SKU' }
]

// Modal State
const showBatchEditModal = ref(false)
const showProductForm = ref(false)
const productFormMode = ref('create')
const selectedProduct = ref({})

// Image Modal State
const showImageModal = ref(false)
const selectedImageProduct = ref({})

// Print Modal State
const showStickerModal = ref(false)
const printBatchList = ref([])

// Bulk Action State
const selectedIds = ref(new Set())
const isProcessingBulk = ref(false)

// Pagination State
const totalProducts = ref(0)
const currentLimit = ref(50)

const selectionCount = computed(() => selectedIds.value.size)
const downloadStore = useDownloadStore()

// Export State
const isExporting = ref(false)

// Bulk Edit / Inline Edit State (from composable)
const {
  dirtyProducts,
  isSavingInline,
  hasDirtyProducts,
  handleInlineEditChange,
  handleCancelInlineEdit,
  handleBulkSaveInline
} = useInlineSave({ fetchProducts: () => fetchProducts(), tableKeyRef: tableKey })

// --- API ACTIONS (TanStack Vue Query) ---
import { useInfiniteQuery, keepPreviousData } from '@tanstack/vue-query'

const searchParams = computed(() => ({
  limit: currentLimit.value,
  search: searchQuery.value,
  searchBy: searchBy.value,
  sortBy: sortBy.value,
  sortOrder: sortOrder.value,
  is_package: filterType.value === 'all' ? undefined : filterType.value === 'package',
  status: filterStatus.value,
  categoryInclude: JSON.stringify(filterCategory.value.include),
  categoryExclude: JSON.stringify(filterCategory.value.exclude)
}))

const {
  data: productsData,
  isLoading: loading,
  isFetchingNextPage,
  fetchNextPage,
  hasNextPage,
  refetch: fetchProducts
} = useInfiniteQuery({
  queryKey: ['products', searchParams],
  queryFn: async ({ pageParam = 1 }) => {
    const response = await axios.get('/products', {
      params: { ...searchParams.value, page: pageParam }
    })
    return response.data
  },
  getNextPageParam: (lastPage, allPages) => {
    const total = lastPage.total || 0
    const limit = currentLimit.value || 50
    const last = Math.ceil(total / limit) || 1
    const current = allPages.length
    return current < last ? current + 1 : undefined
  },
  placeholderData: keepPreviousData,
  staleTime: 60 * 1000 // 1 minute
})

watch(
  productsData,
  resData => {
    if (resData && resData.pages) {
      products.value = resData.pages.flatMap(page => page.data || page.products || [])
      const lastPage = resData.pages[resData.pages.length - 1]
      totalProducts.value = lastPage.meta?.total || lastPage.total || 0
    } else {
      products.value = []
      totalProducts.value = 0
    }
  },
  { immediate: true }
)

// --- HANDLERS (Dioper ke Child Components) ---
const handleFetchMore = () => {
  if (hasNextPage.value && !isFetchingNextPage.value) {
    fetchNextPage()
  }
}

// Pagination & Sorting
const handleSort = field => {
  if (sortBy.value === field) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  else {
    sortBy.value = field
    sortOrder.value = 'asc'
  }
  fetchProducts()
}

// Search & Filter (Debounce)
const handleFilterChange = debounce(() => {
  selectedIds.value.clear()
  fetchProducts()
}, 300)

watch(
  [
    searchQuery,
    searchBy,
    filterType,
    filterStatus,
    () => filterCategory.value.include,
    () => filterCategory.value.exclude
  ],
  handleFilterChange,
  { deep: true }
)

// Selection
const toggleSelection = id => {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

const toggleSelectAll = () => {
  const allSelected = products.value.length > 0 && products.value.every(p => selectedIds.value.has(p.id))
  if (allSelected) products.value.forEach(p => selectedIds.value.delete(p.id))
  else products.value.forEach(p => selectedIds.value.add(p.id))
}

// CRUD
const handleDelete = async product => {
  if (!(await swalConfirm(`Arsipkan produk "${product.name}"?`))) return
  try {
    await axios.delete(`/products/${product.id}`)
    toast('Produk berhasil diarsipkan.', 'success')
    if (selectedIds.value.has(product.id)) selectedIds.value.delete(product.id)
    fetchProducts()
  } catch (err) {
    console.error(err)
  }
}

const handleRestore = async product => {
  if (!(await swalConfirm(`Pulihkan produk "${product.name}"?`))) return
  try {
    await axios.put(`/products/${product.id}`, { is_active: true })
    toast('Produk dipulihkan.', 'success')
    if (selectedIds.value.has(product.id)) selectedIds.value.delete(product.id)
    fetchProducts()
  } catch (err) {
    console.error(err)
  }
}

// Modals
const openAddModal = async () => {
  productFormMode.value = 'create'
  selectedProduct.value = {}
  showProductForm.value = true
}
const openEditModal = p => {
  productFormMode.value = 'edit'
  selectedProduct.value = p
  showProductForm.value = true
}
const openDuplicateModal = p => {
  productFormMode.value = 'duplicate'
  selectedProduct.value = p
  showProductForm.value = true
}

const openImageModal = p => {
  selectedImageProduct.value = p
  showImageModal.value = true
}

// Bulk Actions
const performBulkAction = async actionType => {
  if (!selectedIds.value.size) return

  const msg = actionType === 'archive' ? 'Arsipkan' : 'Pulihkan'
  if (!(await swalConfirm(`${msg} ${selectionCount.value} produk terpilih?`))) return

  isProcessingBulk.value = true
  const ids = [...selectedIds.value]
  const promises = []

  try {
    ids.forEach(id => {
      if (actionType === 'archive') promises.push(axios.delete(`/products/${id}`))
      else promises.push(axios.put(`/products/${id}`, { is_active: true }))
    })
    await Promise.all(promises)
    toast(`Berhasil memproses ${ids.length} produk.`, 'success')
    selectedIds.value.clear()
    fetchProducts()
  } catch (e) {
    console.error(e)
  } finally {
    isProcessingBulk.value = false
  }
}

const handleBulkPrintLabel = () => {
  const sourceProducts =
    selectedIds.value.size > 0 ? products.value.filter(p => selectedIds.value.has(p.id)) : products.value

  printBatchList.value = sourceProducts.map(p => ({
    sku: p.sku,
    name: p.name,
    price: p.price,
    quantity: 1
  }))
  showStickerModal.value = true
}

// Batch Edit (Export & Import)
const handleExport = async ({ format, includeImages, columns }) => {
  isExporting.value = true
  try {
    const params = {
      search: searchQuery.value,
      searchBy: searchBy.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      is_package: filterType.value === 'all' ? undefined : filterType.value === 'package',
      status: filterStatus.value,
      categoryInclude: JSON.stringify(filterCategory.value.include),
      categoryExclude: JSON.stringify(filterCategory.value.exclude),
      format: format, // 'xlsx' or 'csv'
      includeImages: includeImages,
      columns: JSON.stringify(columns)
    }

    // Request Job Creation
    const response = await axios.get('/products/export', { params })

    if (response.data.success) {
      toast('Permintaan export produk diterima.', 'success')
      downloadStore.notifyNewJob()
    }
  } catch (err) {
    console.error(err)
  } finally {
    isExporting.value = false
  }
}

const executeBulkSaveInline = () => {
  handleBulkSaveInline(products.value)
}

const handleImport = async formData => {
  // Logic from old PriceUpdateModal/ProductImportModal
  try {
    await axios.post('/products/batch/product-update', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    toast('File diunggah. Buka kembali Batch Edit > Tab Riwayat & Log untuk memantau status.', 'info')
    showBatchEditModal.value = false
    fetchProducts()
  } catch (err) {
    console.error(err)
  }
}

const handleProductSaved = () => {
  fetchProducts()
}

const handleImageSaved = () => {
  fetchProducts()
}

const fetchCategories = async () => {
  try {
    const categories = await masterStore.getCategories()
    categoryOptions.value = categories.map(c => ({ id: c.id, label: c.name }))
  } catch (err) {
    console.error('Gagal memuat kategori', err)
  }
}

// Init
onMounted(() => {
  fetchCategories()
  fetchProducts()
})

useFirebaseSync('MASTER_DATA', 'REFRESH_PRODUCTS', () => fetchProducts())

// --- LOCAL HOTKEYS ---
const { Alt_N, Alt_A, Alt_R, Slash } = useMagicKeys()

watch(Alt_N, pressed => {
  if (pressed && !showProductForm.value && !showImageModal.value && !showBatchEditModal.value) {
    openAddModal()
  }
})

watch(Alt_A, pressed => {
  if (pressed && !showProductForm.value && !showImageModal.value && !showBatchEditModal.value) {
    toggleSelectAll()
  }
})

watch(Alt_R, pressed => {
  if (pressed && !showProductForm.value && !showImageModal.value && !showBatchEditModal.value) {
    fetchProducts()
  }
})

watch(Slash, pressed => {
  if (pressed && !showProductForm.value && !showImageModal.value && !showBatchEditModal.value) {
    setTimeout(() => {
      const el = document.getElementById('global-search-input')
      if (el) el.focus()
    }, 10)
  }
})
</script>

<template>
  <div class="w-full max-w-7xl mx-auto flex flex-col h-full relative">
    <!-- HEADER -->
    <div class="shrink-0 mb-6">
      <WmsActionHeader title="Manajemen Produk" icon="fa-solid fa-tags">
        <template #actions>
          <div class="flex flex-wrap gap-3">
            <button
              v-if="hasDirtyProducts"
              @click="handleCancelInlineEdit"
              :disabled="isSavingInline"
              class="px-5 py-2.5 bg-danger hover:bg-danger/90 text-secondary rounded-xl shadow-md font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              <font-awesome-icon icon="fa-solid fa-times" />
              <span class="hidden sm:inline">Batal</span>
            </button>

            <!-- Tombol Simpan Perubahan (Muncul jika ada dirty) -->
            <button
              v-if="dirtyProducts.size > 0"
              @click="executeBulkSaveInline"
              class="bg-accent/90 text-secondary px-4 py-2 rounded-lg font-medium shadow transition hover:bg-accent hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              :disabled="isSavingInline"
            >
              <font-awesome-icon v-if="isSavingInline" icon="fa-solid fa-spinner" spin class="mr-2" />
              <font-awesome-icon v-else icon="fa-solid fa-save" class="mr-2" />
              Simpan Semua ({{ dirtyProducts.size }})
            </button>

            <!-- Tombol Batch Edit -->
            <button
              @click="showBatchEditModal = true"
              class="px-5 py-2.5 bg-success/10 hover:bg-success/20 text-success rounded-xl shadow-md font-medium flex items-center gap-2 transition-all border border-success/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              title="Edit produk secara massal (Export & Import)"
            >
              <font-awesome-icon icon="fa-solid fa-pen-to-square" />
              <span class="hidden sm:inline">Batch Edit</span>
            </button>

            <!-- Tombol Cetak Label -->
            <button
              @click="handleBulkPrintLabel"
              class="px-5 py-2.5 bg-accent/10 hover:bg-accent/20 text-accent rounded-xl shadow-sm font-medium flex items-center gap-2 transition-all border border-accent/50 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              title="Cetak Label untuk produk terpilih atau semua produk di halaman ini"
            >
              <font-awesome-icon icon="fa-solid fa-print" />
              <span class="hidden sm:inline">Cetak Label</span>
            </button>

            <!-- Tombol Tambah Produk -->
            <button
              @click="openAddModal"
              class="px-5 py-2.5 bg-primary hover:bg-primary/90 text-secondary rounded-xl shadow-lg font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              <font-awesome-icon icon="fa-solid fa-plus" />
              <span>Tambah</span>
            </button>
          </div>
        </template>
      </WmsActionHeader>

      <!-- FILTER BAR COMPONENT -->
      <BaseFilterPanel>
        <template #filters>
          <div class="flex flex-col lg:flex-row flex-wrap gap-4 items-center w-full">
            <!-- Filter Tipe Produk -->
            <div
              class="flex bg-secondary/20 rounded-xl p-1 border border-secondary/10 shrink-0 overflow-x-auto w-full lg:w-auto"
            >
              <button
                @click="filterType = 'all'"
                class="px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2"
                :class="
                  filterType === 'all'
                    ? 'bg-background text-text shadow-sm'
                    : 'text-text/50 hover:text-text hover:bg-secondary/5'
                "
              >
                <font-awesome-icon icon="fa-solid fa-layer-group" />
                <span>Semua Tipe</span>
              </button>
              <button
                @click="filterType = 'single'"
                class="px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2"
                :class="
                  filterType === 'single'
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-text/50 hover:text-primary hover:bg-primary/5'
                "
              >
                <font-awesome-icon icon="fa-solid fa-box" />
                <span>Satuan</span>
              </button>
              <button
                @click="filterType = 'package'"
                class="px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2"
                :class="
                  filterType === 'package'
                    ? 'bg-accent/10 text-accent shadow-sm'
                    : 'text-text/50 hover:text-accent hover:bg-accent/5'
                "
              >
                <font-awesome-icon icon="fa-solid fa-boxes-stacked" />
                <span>Paket</span>
              </button>
            </div>

            <!-- Filter Status -->
            <div class="shrink-0 w-full sm:w-44">
              <BaseSelect
                v-model="filterStatus"
                :options="statusOptions"
                label="label"
                track-by="id"
                placeholder="Semua Status"
                :searchable="false"
                emit-value
                clearable
                clear-value="all"
              />
            </div>

            <!-- Filter Kategori -->
            <div class="shrink-0 w-full sm:w-48">
              <TriStateSelect
                v-model="filterCategory"
                :options="categoryOptions"
                label="label"
                track="id"
                placeholder="Semua Kategori"
                :searchable="true"
              />
            </div>

            <!-- Search Group -->
            <div class="flex flex-col sm:flex-row flex-1 gap-2 w-full lg:w-auto lg:ml-auto">
              <div class="shrink-0 w-full sm:w-28">
                <BaseSelect
                  v-model="searchBy"
                  :options="searchByOptions"
                  label="label"
                  track-by="id"
                  placeholder="Cari"
                  :searchable="false"
                  emit-value
                />
              </div>

              <div class="relative flex-1">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-text/40">
                  <font-awesome-icon icon="fa-solid fa-search" />
                </span>
                <input
                  id="global-search-input"
                  v-model="searchQuery"
                  type="text"
                  :placeholder="`Cari ${searchBy === 'sku' ? 'SKU' : 'Nama'}...`"
                  class="w-full pl-9 pr-4 py-2.5 bg-background border border-secondary/20 rounded-xl focus:outline-none focus:border-primary text-text text-sm placeholder-text/30 transition-all shadow-sm"
                />
              </div>
            </div>
          </div>
        </template>
      </BaseFilterPanel>
    </div>

    <!-- TABLE COMPONENT -->
    <ProductTable
      :key="tableKey"
      :products="products"
      :categoryOptions="categoryOptions"
      :loading="loading"
      :selectedIds="selectedIds"
      :sortBy="sortBy"
      :sortOrder="sortOrder"
      :dirtyProducts="dirtyProducts"
      :isSaving="isSavingInline"
      :isFetchingNextPage="isFetchingNextPage"
      :hasNextPage="hasNextPage"
      @sort="handleSort"
      @fetch-more="handleFetchMore"
      @toggleSelection="toggleSelection"
      @toggleSelectAll="toggleSelectAll"
      @edit="openEditModal"
      @duplicate="openDuplicateModal"
      @view-history="openEditModal"
      @restore="handleRestore"
      @delete="handleDelete"
      @view-image="openImageModal"
      @cell-edit="handleInlineEditChange"
    />

    <!-- FLOATING ACTION BAR -->
    <Transition name="slide-up">
      <div
        v-if="selectedIds.size > 0"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border border-secondary/20 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-6 z-40 text-sm"
      >
        <div class="flex items-center gap-2 text-text font-bold border-r border-secondary/10 pr-6">
          <span class="bg-primary/10 text-primary p-2 flex items-center justify-center rounded-full text-xs">{{
            selectionCount
          }}</span>
          <span>Dipilih</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            @click="handleBulkPrintLabel"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary/10 text-text/80 hover:text-primary font-medium"
          >
            <font-awesome-icon icon="fa-solid fa-print" /> Cetak Label
          </button>
          <button
            v-if="filterStatus === 'archived'"
            @click="performBulkAction('restore')"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-success/10 text-success font-bold"
            :disabled="isProcessingBulk"
          >
            <font-awesome-icon icon="fa-solid fa-rotate-left" :spin="isProcessingBulk" />
            Pulihkan
          </button>
          <button
            v-else
            @click="performBulkAction('archive')"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-danger/10 text-danger font-bold"
            :disabled="isProcessingBulk"
          >
            <font-awesome-icon icon="fa-solid fa-box-archive" :spin="isProcessingBulk" />
            Arsipkan
          </button>
        </div>
        <button
          @click="selectedIds.clear()"
          class="ml-2 text-text/40 hover:text-text text-xl leading-none"
          title="Batalkan Pilihan"
        >
          &times;
        </button>
      </div>
    </Transition>

    <!-- MODALS -->
    <ProductFormModal
      :show="showProductForm"
      :mode="productFormMode"
      :product-data="selectedProduct"
      @close="showProductForm = false"
      @refresh="handleProductSaved"
    />

    <ProductImageModal
      :show="showImageModal"
      :product-data="selectedImageProduct"
      @close="showImageModal = false"
      @refresh="handleImageSaved"
    />

    <!-- Batch Edit Modal -->
    <BatchEditModal
      :is-open="showBatchEditModal"
      :is-exporting="isExporting"
      :is-importing="false"
      @close="showBatchEditModal = false"
      @export="handleExport"
      @import="handleImport"
    />

    <!-- Sticker Generator Modal -->
    <StickerGeneratorModal :show="showStickerModal" @close="showStickerModal = false" :initial-batch="printBatchList" />
  </div>

  <!-- GLOBAL COMPONENTS -->
  <ConnectionStatus />
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}
</style>
