<!-- frontend/src/views/admin/ProductManagement.vue -->
<script setup>
import { ref, reactive, onMounted, watch, computed } from 'vue'
import { useToast } from '@/composables/useToast.js'
import axios from '@/api/axios.js'
import { debounce } from 'lodash'

// Components
import BatchEditModal from '@/components/products/BatchEditModal.vue'
import ProductFormModal from '@/components/wms/shared/ProductFormModal.vue'
import ConnectionStatus from '@/components/wms/shared/ConnectionStatus.vue' // Optional if needed
import ProductFilterBar from '@/components/products/ProductFilterBar.vue'
import ProductTable from '@/components/products/ProductTable.vue'

const { show } = useToast()

// --- STATE ---
const products = ref([])
const loading = ref(false)
const searchQuery = ref('')
const searchBy = ref('name')
const filterType = ref('all')
const filterStatus = ref('active')
const sortBy = ref('sku')
const sortOrder = ref('desc')

// Modal State
const showBatchEditModal = ref(false)
const showProductForm = ref(false)
const productFormMode = ref('create')
const selectedProduct = ref({})

// Bulk Action State
const selectedIds = ref(new Set())
const isProcessingBulk = ref(false)

// Pagination State
const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
})

const selectionCount = computed(() => selectedIds.value.size)

// Export State
const isExporting = ref(false)

// --- API ACTIONS ---

const fetchProducts = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      search: searchQuery.value,
      searchBy: searchBy.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      is_package: filterType.value === 'all' ? undefined : filterType.value === 'package',
      status: filterStatus.value,
    }
    const response = await axios.get('/products', { params })
    const resData = response.data
    const items = resData.data || resData.products || []

    if (Array.isArray(items)) {
      products.value = items
      pagination.total = resData.meta?.total || resData.total || 0
      pagination.totalPages =
        resData.meta?.last_page || Math.ceil(pagination.total / pagination.limit) || 1
    } else {
      products.value = []
      pagination.total = 0
      pagination.totalPages = 1
    }
  } catch (err) {
    console.error(err)
    show('Gagal memuat data produk.', 'error')
  } finally {
    loading.value = false
  }
}

// --- HANDLERS (Dioper ke Child Components) ---

// Pagination & Sorting
const handleChangePage = (page) => {
  pagination.page = page
  fetchProducts()
}
const handleUpdateLimit = (limit) => {
  pagination.limit = limit
  pagination.page = 1
  fetchProducts()
}
const handleSort = (field) => {
  if (sortBy.value === field) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  else {
    sortBy.value = field
    sortOrder.value = 'asc'
  }
  fetchProducts()
}

// Search & Filter (Debounce)
const handleFilterChange = debounce(() => {
  pagination.page = 1
  selectedIds.value.clear()
  fetchProducts()
}, 300)

watch([searchQuery, searchBy, filterType, filterStatus], handleFilterChange)

// Selection
const toggleSelection = (id) => {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}

const toggleSelectAll = () => {
  const allSelected =
    products.value.length > 0 && products.value.every((p) => selectedIds.value.has(p.id))
  if (allSelected) products.value.forEach((p) => selectedIds.value.delete(p.id))
  else products.value.forEach((p) => selectedIds.value.add(p.id))
}

// CRUD
const handleDelete = async (product) => {
  if (!confirm(`Arsipkan produk "${product.name}"?`)) return
  try {
    await axios.delete(`/products/${product.id}`)
    show('Produk berhasil diarsipkan.', 'success')
    if (selectedIds.value.has(product.id)) selectedIds.value.delete(product.id)
    fetchProducts()
  } catch (err) {
    console.error(err)
    show('Gagal menghapus produk.', 'error')
  }
}

const handleRestore = async (product) => {
  if (!confirm(`Pulihkan produk "${product.name}"?`)) return
  try {
    await axios.put(`/products/${product.id}`, { is_active: true })
    show('Produk dipulihkan.', 'success')
    if (selectedIds.value.has(product.id)) selectedIds.value.delete(product.id)
    fetchProducts()
  } catch (err) {
    console.error(err)
    show('Gagal memulihkan produk.', 'error')
  }
}

// Modals
const openAddModal = () => {
  productFormMode.value = 'create'
  selectedProduct.value = {}
  showProductForm.value = true
}
const openEditModal = (p) => {
  productFormMode.value = 'edit'
  selectedProduct.value = p
  showProductForm.value = true
}

// Bulk Actions
const performBulkAction = async (actionType) => {
  if (!selectedIds.value.size) return

  const msg = actionType === 'archive' ? 'Arsipkan' : 'Pulihkan'
  if (!confirm(`${msg} ${selectionCount.value} produk terpilih?`)) return

  isProcessingBulk.value = true
  const ids = [...selectedIds.value]
  const promises = []

  try {
    ids.forEach((id) => {
      if (actionType === 'archive') promises.push(axios.delete(`/products/${id}`))
      else promises.push(axios.put(`/products/${id}`, { is_active: true }))
    })
    await Promise.all(promises)
    show(`Berhasil memproses ${ids.length} produk.`, 'success')
    selectedIds.value.clear()
    fetchProducts()
  } catch (err) {
    show('Terjadi kesalahan saat batch processing.', 'error')
  } finally {
    isProcessingBulk.value = false
  }
}

const handleBulkPrintLabel = () =>
  alert(`Fitur Cetak Label untuk ${selectionCount.value} produk segera hadir!`)

// Batch Edit (Export & Import)
const handleExport = async ({ format }) => {
  isExporting.value = true
  try {
    const params = {
      search: searchQuery.value,
      searchBy: searchBy.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      is_package: filterType.value === 'all' ? undefined : filterType.value === 'package',
      status: filterStatus.value,
      format: format, // 'xlsx' or 'csv'
    }

    // Request Job Creation
    const response = await axios.get('/products/export', { params })

    if (response.data.success) {
      show('Permintaan export diterima. Silakan cek menu Laporan Saya.', 'success')
    }
  } catch (err) {
    console.error(err)
    show('Gagal request export.', 'error')
  } finally {
    isExporting.value = false
  }
}

const handleImport = async (formData) => {
  // Logic from old PriceUpdateModal/ProductImportModal
  try {
    await axios.post('/products/batch/price-update', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    show('File diunggah. Cek menu Logs untuk status.', 'info')
    showBatchEditModal.value = false
    fetchProducts()
  } catch (err) {
    console.error(err)
    show(err.response?.data?.message || 'Gagal mengunggah file.', 'error')
  }
}

const handleProductSaved = () => {
  fetchProducts()
}

// Init
onMounted(() => {
  fetchProducts()
})
</script>

<template>
  <div class="bg-background min-h-screen p-6 text-text flex flex-col h-screen overflow-hidden">
    <div class="w-full max-w-7xl mx-auto flex flex-col h-full relative">
      <!-- HEADER -->
      <div class="shrink-0 mb-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
              <span class="bg-primary/10 text-primary p-2 rounded-lg text-2xl">
                <font-awesome-icon icon="fa-solid fa-tags" />
              </span>
              Manajemen Produk
            </h1>
          </div>
          <div class="flex flex-wrap gap-3">
            <!-- Tombol Batch Edit -->
             <button
              @click="showBatchEditModal = true"
              class="px-5 py-2.5 bg-secondary hover:bg-secondary/80 text-text rounded-xl shadow-md font-medium flex items-center gap-2 transition-all border border-secondary/30"
              title="Edit produk secara massal (Export & Import)"
            >
              <font-awesome-icon icon="fa-solid fa-pen-to-square" />
              <span class="hidden sm:inline">Batch Edit</span>
            </button>

            <!-- Tombol Tambah Produk -->
            <button
              @click="openAddModal"
              class="px-5 py-2.5 bg-primary hover:bg-primary/90 text-text rounded-xl shadow-lg font-bold flex items-center gap-2 transition-transform hover:-translate-y-0.5"
            >
              <font-awesome-icon icon="fa-solid fa-plus" />
              <span>Tambah</span>
            </button>
          </div>
        </div>

        <!-- FILTER BAR COMPONENT -->
        <ProductFilterBar
          v-model:filterType="filterType"
          v-model:filterStatus="filterStatus"
          v-model:searchBy="searchBy"
          v-model:searchQuery="searchQuery"
        />
      </div>

      <!-- TABLE COMPONENT -->
      <ProductTable
        :products="products"
        :loading="loading"
        :pagination="pagination"
        :selectedIds="selectedIds"
        :sortBy="sortBy"
        :sortOrder="sortOrder"
        @sort="handleSort"
        @changePage="handleChangePage"
        @update:limit="handleUpdateLimit"
        @toggleSelection="toggleSelection"
        @toggleSelectAll="toggleSelectAll"
        @edit="openEditModal"
        @restore="handleRestore"
        @delete="handleDelete"
      />

      <!-- FLOATING ACTION BAR -->
      <Transition name="slide-up">
        <div
          v-if="selectedIds.size > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border border-secondary/20 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-6 z-40 text-sm"
        >
          <div
            class="flex items-center gap-2 text-text font-bold border-r border-secondary/10 pr-6"
          >
            <span
              class="bg-primary/10 text-primary w-6 h-6 flex items-center justify-center rounded-full text-xs"
              >{{ selectionCount }}</span
            >
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

      <!-- Batch Edit Modal -->
      <BatchEditModal
        :is-open="showBatchEditModal"
        :is-exporting="isExporting"
        :is-importing="false"
        @close="showBatchEditModal = false"
        @export="handleExport"
        @import="handleImport"
      />
    </div>

    <!-- GLOBAL COMPONENTS -->
    <ConnectionStatus />
  </div>
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
