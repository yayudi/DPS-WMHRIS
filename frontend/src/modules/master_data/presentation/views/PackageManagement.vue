<script setup lang="ts">
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { ref, watch, computed, onMounted } from 'vue'
import { useFirebaseSync } from '@/core/presentation/composables/useFirebaseSync'
import { useMagicKeys, refDebounced } from '@vueuse/core'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import { usePackages } from '../../application/usePackages'
import { useProducts } from '../../application/useProducts'
import { productApi } from '@/modules/master_data/infrastructure/product.api'
import ProductFormModal from '@/modules/wms/presentation/components/shared/ProductFormModal.vue'
import ConnectionStatus from '@/modules/wms/presentation/components/shared/ConnectionStatus.vue'
import PackageTable from '@/modules/master_data/presentation/components/products/PackageTable.vue'
import PackageBatchEditModal from '@/modules/master_data/presentation/components/products/PackageBatchEditModal.vue'
import BaseFilterPanel from '@/core/presentation/components/ui/BaseFilterPanel.vue'
import BaseSwitch from '@/core/presentation/components/ui/BaseSwitch.vue'
import SearchInput from '@/core/presentation/components/ui/SearchInput.vue'
import { useInlineSave } from '@/core/presentation/composables/useInlineSave'
import { useDownloadStore } from '@/core/presentation/stores/downloadStore'
import { useUploadStore } from '@/core/presentation/stores/uploadStore'
import BasePagination from '@/core/presentation/components/ui/BasePagination.vue'
import { usePagination } from '@/core/presentation/composables/usePagination'
import { useCatalogManagement } from '../composables/useCatalogManagement'

const { toast } = useToast()
const { t } = useI18n()

// --- CATALOG COMPOSABLE ---
const {
  selectedIds,
  selectionCount,
  isProcessingBulk,
  showBatchEditModal,
  showProductForm,
  productFormMode,
  selectedProduct,
  tableKey,
  searchQuery,
  searchBy,
  filterStatus,
  sortBy,
  sortOrder,
  toggleSelection,
  toggleSelectAll: baseToggleSelectAll,
  openAddModal,
  openEditModal,
  openDuplicateModal,
  handleDelete,
  handleRestore,
  performBulkAction: executeCatalogBulkAction,
  handleSort
} = useCatalogManagement({
  entityLabel: 'paket',
  initialSortBy: 'name',
  initialSortOrder: 'asc',
  onArchiveItem: id => apiDeleteProduct(id),
  onRestoreItem: id => productApi.updateProduct(id, { is_active: true, is_package: true }),
  onRefetch: () => fetchProducts()
})

const toggleSelectAll = () => baseToggleSelectAll(products.value)

// --- STATE ---
const products = ref([])
const debouncedSearchQuery = refDebounced(searchQuery, 300)
const packageTableRef = ref(null)

const searchByOptions = computed(() => [
  { value: 'name', label: t('common.label.name') },
  { value: 'sku', label: t('common.label.sku') }
])

const {
  dirtyProducts,
  isSavingInline,
  hasDirtyProducts,
  handleInlineEditChange,
  handleCancelInlineEdit,
  handleBulkSaveInline
} = useInlineSave({
  saveItem: (id, payload) => productApi.updateProduct(id, payload),
  fetchProducts: () => fetchProducts(),
  tableKeyRef: tableKey,
  afterSaveAction: () => packageTableRef.value?.clearComponentCache()
})

// Pagination State
const totalProducts = ref(0)

const {
  meta: paginationState,
  changePage: handlePageChange,
  changePageSize: handleLimitChange
} = usePagination({
  totalItems: totalProducts,
  storageKey: 'wms_package_pagination',
  initialLimit: 50
})

const searchParams = computed(() => ({
  page: paginationState.value.page,
  limit: paginationState.value.limit,
  search: debouncedSearchQuery.value,
  searchBy: searchBy.value,
  sortBy: sortBy.value,
  sortOrder: sortOrder.value,
  is_package: true,
  packageOnly: true,
  status: filterStatus.value,
  skipComponents: true
}))

const { usePackageSearchQuery, exportPackages, uploadPackageUpdate } = usePackages()
const { deleteProduct: apiDeleteProduct, bulkAction: apiBulkAction } = useProducts()
const { data: productsData, isLoading: loading, refetch: fetchProducts } = usePackageSearchQuery(searchParams)

watch(
  productsData,
  resData => {
    console.log('[PackageManagement] API response received:', resData)
    if (Array.isArray(resData)) {
      products.value = resData
      totalProducts.value = resData.length
    } else if (resData) {
      products.value = resData.data || resData.products || []
      totalProducts.value = resData.meta?.total ?? resData.total ?? products.value.length
    } else {
      products.value = []
      totalProducts.value = 0
    }
    console.log('[PackageManagement] Parsed state:', {
      packagesCount: products.value.length,
      totalPackages: totalProducts.value,
      sampleFirstRow: products.value[0] || null
    })
  },
  { immediate: true }
)

const downloadStore = useDownloadStore()
const uploadStore = useUploadStore()
const isExporting = ref(false)
const isImporting = ref(false)

// --- HANDLERS ---

// Watch filter state changes to clear selection
// TanStack Query automatically refetches when searchParams (the query key) changes
watch([debouncedSearchQuery, searchBy, filterStatus], () => {
  selectedIds.value.clear()
  handlePageChange(1)
})

// Bulk Actions (O(1) Map-based execution via useCatalogManagement)
const performBulkAction = (actionType: 'archive' | 'restore') => {
  return executeCatalogBulkAction(actionType, products.value, {
    archiveFn: id => productApi.deleteProduct(id),
    restoreFn: id => productApi.updateProduct(id, { is_active: true, is_package: true })
  })
}

// Inline Edit logic is handled by useInlineSave
const executeBulkSaveInline = () => {
  handleBulkSaveInline(products.value)
}

// Exports / Imports (Package Phase 2)
const handleExport = async ({ format }) => {
  isExporting.value = true
  try {
    const params = {
      search: searchQuery.value,
      searchBy: searchBy.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      status: filterStatus.value,
      format: format // 'xlsx' or 'csv'
    }

    // Request Job Creation
    const response = await exportPackages(params)

    if (response?.success) {
      toast(response?.message || t('common.status.success'), 'success')
      downloadStore.notifyNewJob()
    }
  } catch (err) {
    console.error(err)
  } finally {
    isExporting.value = false
  }
}

const handleImport = async formData => {
  // Use new endpoint for packages
  isImporting.value = true
  try {
    await uploadPackageUpdate(formData)
    toast(t('master_data.package.upload_info'), 'info')
    uploadStore.notifyNewJob()
    showBatchEditModal.value = false
    fetchProducts()
  } catch (err) {
    console.error(err)
  } finally {
    isImporting.value = false
  }
}
const handleProductSaved = () => {
  packageTableRef.value?.clearComponentCache()
  fetchProducts()
}

// Init
onMounted(() => {
  fetchProducts()
})

useFirebaseSync('MASTER_DATA', 'REFRESH_PRODUCTS', () => {
  packageTableRef.value?.clearComponentCache()
  fetchProducts(true)
})

// --- LOCAL HOTKEYS ---
const { Alt_N, Alt_A, Alt_R, Slash } = useMagicKeys()

watch(Alt_N, pressed => {
  if (pressed && !showProductForm.value && !showBatchEditModal.value) {
    openAddModal()
  }
})

watch(Alt_A, pressed => {
  if (pressed && !showProductForm.value && !showBatchEditModal.value) {
    toggleSelectAll()
  }
})

watch(Alt_R, pressed => {
  if (pressed && !showProductForm.value && !showBatchEditModal.value) {
    fetchProducts()
  }
})

watch(Slash, pressed => {
  if (pressed && !showProductForm.value && !showBatchEditModal.value) {
    setTimeout(() => {
      const el = document.getElementById('global-search-input')
      if (el) el.focus()
    }, 10)
  }
})
</script>

<template>
  <div class="bg-background min-h-screen px-6 text-text flex flex-col h-screen overflow-hidden">
    <div class="w-full mx-auto flex flex-col h-full relative">
      <!-- HEADER -->
      <div class="shrink-0">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 w-full mb-4">
          <BaseFilterPanel>
            <template #search>
              <div class="flex flex-col sm:flex-row items-center gap-4 w-full">
                <SearchInput
                  v-model="searchQuery"
                  v-model:search-by="searchBy"
                  :search-by-options="searchByOptions"
                  input-id="global-search-input"
                  :placeholder="`${t('common.btn.search')} ${searchBy === 'sku' ? t('master_data.package.sku') : t('common.label.package_name')}...`"
                  class="flex-1 w-full sm:min-w-[320px] lg:min-w-[420px]"
                />
                <div class="flex items-center gap-2 w-full sm:w-auto">
                  <BaseSwitch
                    :model-value="filterStatus === 'archived'"
                    @update:model-value="val => (filterStatus = val ? 'archived' : 'active')"
                    :left-label="t('common.status.active')"
                    :right-label="t('common.status.archived')"
                    class="w-full sm:w-auto"
                  />
                </div>
              </div>
            </template>
          </BaseFilterPanel>
          <div class="flex gap-2">
            <button
              v-if="hasDirtyProducts"
              @click="handleCancelInlineEdit"
              :disabled="isSavingInline"
              class="px-5 py-2 bg-danger hover:bg-danger/90 text-secondary rounded-xl font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              <font-awesome-icon icon="fa-solid fa-times" />
              <span class="hidden sm:inline">{{ t('common.btn.cancel') }}</span>
            </button>

            <button
              v-if="dirtyProducts.size > 0"
              @click="executeBulkSaveInline"
              class="bg-accent/80 text-secondary px-4 py-2 rounded-xl font-medium shadow transition-all hover:bg-accent hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              :disabled="isSavingInline"
            >
              <font-awesome-icon v-if="isSavingInline" icon="fa-solid fa-spinner" spin class="mr-2" />
              <font-awesome-icon v-else icon="fa-solid fa-save" class="mr-2" />
              {{ t('common.btn.save') }} ({{ dirtyProducts.size }})
            </button>

            <button
              @click="showBatchEditModal = true"
              class="px-5 py-2 bg-background/30 hover:bg-secondary/80 text-text rounded-xl font-medium flex items-center gap-2 transition-all border-2 border-secondary hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              title="Edit paket secara massal (Export & Import)"
            >
              <font-awesome-icon icon="fa-solid fa-pen-to-square" />
              <span class="hidden sm:inline">{{ t('master_data.package.btn_batch_edit') }}</span>
            </button>

            <button
              @click="openAddModal"
              class="px-5 py-2 bg-primary hover:bg-primary/90 text-secondary rounded-xl font-bold flex items-center gap-2 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              <font-awesome-icon icon="fa-solid fa-plus" />
              <span>{{ t('master_data.package.btn_create') }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- TABLE COMPONENT -->
      <PackageTable
        ref="packageTableRef"
        :key="tableKey"
        :dirtyProducts="dirtyProducts"
        :isSaving="isSavingInline"
        :products="products"
        :loading="loading"
        :selectedIds="selectedIds"
        :sortBy="sortBy"
        :sortOrder="sortOrder"
        :isFetchingNextPage="false"
        :hasNextPage="false"
        @cell-edit="handleInlineEditChange"
        @sort="handleSort"
        @toggleSelection="toggleSelection"
        @toggleSelectAll="toggleSelectAll"
        @edit="openEditModal"
        @duplicate="openDuplicateModal"
        @view-history="openEditModal"
        @restore="handleRestore"
        @delete="handleDelete"
      />

      <!-- PAGINATION -->
      <div class="mt-4 sticky bottom-0 z-10 bg-background/90 backdrop-blur">
        <BasePagination
          :pagination="paginationState"
          @changePage="handlePageChange"
          @update:limit="handleLimitChange"
        />
      </div>

      <!-- FLOATING ACTION BAR -->
      <Transition name="slide-up">
        <div
          v-if="selectedIds.size > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-background border border-secondary/20 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-6 z-40 text-sm"
        >
          <div class="flex items-center gap-2 text-text font-bold border-r border-secondary/10 pr-6">
            <span class="bg-primary/10 text-primary w-6 h-6 flex items-center justify-center rounded-full text-xs">{{
              selectionCount
            }}</span>
            <span>{{ t('master_data.package.selected_count') }}</span>
          </div>
          <div class="flex items-center gap-3">
            <button
              v-if="filterStatus === 'archived'"
              @click="performBulkAction('restore')"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-success/10 text-success font-bold"
              :disabled="isProcessingBulk"
            >
              <font-awesome-icon icon="fa-solid fa-rotate-left" :spin="isProcessingBulk" />
              {{ t('master_data.context_menu.restore_product') }}
            </button>
            <button
              v-else
              @click="performBulkAction('archive')"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-danger/10 text-danger font-bold"
              :disabled="isProcessingBulk"
            >
              <font-awesome-icon icon="fa-solid fa-box-archive" :spin="isProcessingBulk" />
              {{ t('master_data.context_menu.archive_product') }}
            </button>
          </div>
          <button
            @click="selectedIds.clear()"
            class="ml-2 text-text/40 hover:text-text text-xl leading-none"
            :title="t('common.btn.cancel')"
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
      <!-- Phase 2 Batch Edit Modal -->
      <PackageBatchEditModal
        :is-open="showBatchEditModal"
        :is-exporting="isExporting"
        :is-importing="isImporting"
        @close="showBatchEditModal = false"
        @export="handleExport"
        @import="handleImport"
      />
    </div>
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
