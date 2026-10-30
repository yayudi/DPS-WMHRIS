import { ref, computed, type Ref } from 'vue'
import { swalConfirm } from '@/core/presentation/composables/useSweetAlert'
import { useToast } from '@/core/presentation/composables/useToast'

export interface CatalogItem {
  id: number | string
  name?: string
  sku?: string
  is_active?: boolean
  [key: string]: unknown
}

export interface UseCatalogManagementOptions<T extends CatalogItem = CatalogItem> {
  entityLabel?: string
  initialSortBy?: string
  initialSortOrder?: 'asc' | 'desc'
  onArchiveItem?: (id: number | string) => Promise<unknown>
  onRestoreItem?: (id: number | string, item?: T) => Promise<unknown>
  onRefetch?: () => void | Promise<void>
}

export function useCatalogManagement<T extends CatalogItem = CatalogItem>(
  options: UseCatalogManagementOptions<T> = {}
) {
  const {
    entityLabel = 'produk',
    initialSortBy = 'sku',
    initialSortOrder = 'desc',
    onArchiveItem,
    onRestoreItem,
    onRefetch
  } = options

  const { toast } = useToast()

  // Selection state
  const selectedIds = ref<Set<number | string>>(new Set())
  const selectionCount = computed(() => selectedIds.value.size)
  const isProcessingBulk = ref(false)

  // Modals state
  const showBatchEditModal = ref(false)
  const showProductForm = ref(false)
  const productFormMode = ref<'create' | 'edit' | 'duplicate'>('create')
  const selectedProduct = ref<T | Record<string, unknown>>({})
  const initialFormTab = ref('info')

  // Table & filters state
  const tableKey = ref(0)
  const searchQuery = ref('')
  const searchBy = ref('name')
  const filterStatus = ref('active')
  const sortBy = ref(initialSortBy)
  const sortOrder = ref<'asc' | 'desc'>(initialSortOrder)

  // Selection handlers
  const toggleSelection = (id: number | string): void => {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  const toggleSelectAll = (items: T[]): void => {
    if (!Array.isArray(items) || items.length === 0) return
    const allSelected = items.every(p => selectedIds.value.has(p.id))
    if (allSelected) {
      items.forEach(p => selectedIds.value.delete(p.id))
    } else {
      items.forEach(p => selectedIds.value.add(p.id))
    }
  }

  // Modal openers
  const openAddModal = (tab = 'info'): void => {
    productFormMode.value = 'create'
    selectedProduct.value = {}
    initialFormTab.value = tab
    showProductForm.value = true
  }

  const openEditModal = (item: T, tab = 'info'): void => {
    productFormMode.value = 'edit'
    selectedProduct.value = item
    initialFormTab.value = tab
    showProductForm.value = true
  }

  const openDuplicateModal = (item: T, tab = 'info'): void => {
    productFormMode.value = 'duplicate'
    selectedProduct.value = item
    initialFormTab.value = tab
    showProductForm.value = true
  }

  // Single Item Delete / Restore
  const handleDelete = async (
    item: T,
    customDeleteFn?: (id: number | string) => Promise<unknown>
  ): Promise<void> => {
    const confirmed = await swalConfirm(`Arsipkan ${entityLabel} "${item.name || item.sku || item.id}"?`)
    if (!confirmed) return

    const deleteFn = customDeleteFn || onArchiveItem
    if (!deleteFn) {
      console.warn('[useCatalogManagement] No delete function provided.')
      return
    }

    try {
      await deleteFn(item.id)
      toast(`${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)} berhasil diarsipkan.`, 'success')
      if (selectedIds.value.has(item.id)) {
        selectedIds.value.delete(item.id)
      }
      if (onRefetch) await onRefetch()
    } catch (err) {
      console.error(`[useCatalogManagement] Failed to delete ${entityLabel}:`, err)
    }
  }

  const handleRestore = async (
    item: T,
    customRestoreFn?: (id: number | string, item?: T) => Promise<unknown>
  ): Promise<void> => {
    const confirmed = await swalConfirm(`Pulihkan ${entityLabel} "${item.name || item.sku || item.id}"?`)
    if (!confirmed) return

    const restoreFn = customRestoreFn || onRestoreItem
    if (!restoreFn) {
      console.warn('[useCatalogManagement] No restore function provided.')
      return
    }

    try {
      await restoreFn(item.id, item)
      toast(`${entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1)} dipulihkan.`, 'success')
      if (selectedIds.value.has(item.id)) {
        selectedIds.value.delete(item.id)
      }
      if (onRefetch) await onRefetch()
    } catch (err) {
      console.error(`[useCatalogManagement] Failed to restore ${entityLabel}:`, err)
    }
  }

  // Bulk Actions with O(1) Map indexing
  const performBulkAction = async (
    actionType: 'archive' | 'restore',
    sourceItems: T[],
    customActions?: {
      archiveFn?: (id: number | string) => Promise<unknown>
      restoreFn?: (id: number | string, item?: T) => Promise<unknown>
    }
  ): Promise<void> => {
    if (!selectedIds.value.size) return

    const actionText = actionType === 'archive' ? 'Arsipkan' : 'Pulihkan'
    const confirmed = await swalConfirm(`${actionText} ${selectionCount.value} ${entityLabel} terpilih?`)
    if (!confirmed) return

    isProcessingBulk.value = true

    // Pre-build O(N) map to eliminate O(N^2) search in loop
    const itemMap = new Map<number | string, T>()
    if (Array.isArray(sourceItems)) {
      for (const item of sourceItems) {
        if (item && item.id != null) {
          itemMap.set(item.id, item)
        }
      }
    }

    const ids = Array.from(selectedIds.value)
    const archiveFn = customActions?.archiveFn || onArchiveItem
    const restoreFn = customActions?.restoreFn || onRestoreItem

    try {
      const promises = ids.map(id => {
        const item = itemMap.get(id)
        if (actionType === 'archive') {
          return archiveFn ? archiveFn(id) : Promise.resolve()
        } else {
          return restoreFn ? restoreFn(id, item) : Promise.resolve()
        }
      })

      await Promise.all(promises)
      toast(`Berhasil memproses ${ids.length} ${entityLabel}.`, 'success')
      selectedIds.value.clear()
      if (onRefetch) await onRefetch()
    } catch (err) {
      console.error(`[useCatalogManagement] Bulk action failed:`, err)
    } finally {
      isProcessingBulk.value = false
    }
  }

  // Sorting
  const handleSort = (field: string, refetchFn?: () => void): void => {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortBy.value = field
      sortOrder.value = 'asc'
    }
    const fn = refetchFn || onRefetch
    if (fn) fn()
  }

  return {
    selectedIds,
    selectionCount,
    isProcessingBulk,
    showBatchEditModal,
    showProductForm,
    productFormMode,
    selectedProduct,
    initialFormTab,
    tableKey,
    searchQuery,
    searchBy,
    filterStatus,
    sortBy,
    sortOrder,
    toggleSelection,
    toggleSelectAll,
    openAddModal,
    openEditModal,
    openDuplicateModal,
    handleDelete,
    handleRestore,
    performBulkAction,
    handleSort
  }
}
