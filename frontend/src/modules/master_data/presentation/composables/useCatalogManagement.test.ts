import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCatalogManagement } from './useCatalogManagement'

vi.mock('@/core/presentation/composables/useSweetAlert', () => ({
  swalConfirm: vi.fn().mockResolvedValue(true)
}))

vi.mock('@/core/presentation/composables/useToast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

describe('useCatalogManagement composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('manages single and select-all toggling properly', () => {
    const { selectedIds, selectionCount, toggleSelection, toggleSelectAll } = useCatalogManagement()

    expect(selectionCount.value).toBe(0)
    toggleSelection(1)
    expect(selectedIds.value.has(1)).toBe(true)
    expect(selectionCount.value).toBe(1)

    toggleSelection(1)
    expect(selectedIds.value.has(1)).toBe(false)
    expect(selectionCount.value).toBe(0)

    const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
    toggleSelectAll(items)
    expect(selectionCount.value).toBe(3)
    expect(selectedIds.value.has(1)).toBe(true)
    expect(selectedIds.value.has(2)).toBe(true)
    expect(selectedIds.value.has(3)).toBe(true)

    toggleSelectAll(items)
    expect(selectionCount.value).toBe(0)
  })

  it('handles modal openers and sets product form state correctly', () => {
    const {
      showProductForm,
      productFormMode,
      selectedProduct,
      initialFormTab,
      openAddModal,
      openEditModal,
      openDuplicateModal
    } = useCatalogManagement()

    openAddModal('components')
    expect(showProductForm.value).toBe(true)
    expect(productFormMode.value).toBe('create')
    expect(initialFormTab.value).toBe('components')

    openEditModal({ id: 10, name: 'Sample Item' }, 'info')
    expect(productFormMode.value).toBe('edit')
    expect(selectedProduct.value).toEqual({ id: 10, name: 'Sample Item' })

    openDuplicateModal({ id: 20, name: 'Dupe Item' })
    expect(productFormMode.value).toBe('duplicate')
    expect(selectedProduct.value).toEqual({ id: 20, name: 'Dupe Item' })
  })

  it('performs bulk actions with O(1) map lookup without error', async () => {
    const mockArchive = vi.fn().mockResolvedValue({ success: true })
    const mockRestore = vi.fn().mockResolvedValue({ success: true })
    const mockRefetch = vi.fn()

    const { selectedIds, toggleSelection, performBulkAction } = useCatalogManagement({
      entityLabel: 'produk',
      onArchiveItem: mockArchive,
      onRestoreItem: mockRestore,
      onRefetch: mockRefetch
    })

    const sourceProducts = [
      { id: 1, name: 'P1', sku: 'SKU1' },
      { id: 2, name: 'P2', sku: 'SKU2' },
      { id: 3, name: 'P3', sku: 'SKU3' }
    ]

    toggleSelection(1)
    toggleSelection(3)

    await performBulkAction('archive', sourceProducts)

    expect(mockArchive).toHaveBeenCalledTimes(2)
    expect(mockArchive).toHaveBeenCalledWith(1)
    expect(mockArchive).toHaveBeenCalledWith(3)
    expect(selectedIds.value.size).toBe(0)
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('toggles sort order and updates field properly', () => {
    const mockRefetch = vi.fn()
    const { sortBy, sortOrder, handleSort } = useCatalogManagement({
      initialSortBy: 'name',
      initialSortOrder: 'asc',
      onRefetch: mockRefetch
    })

    expect(sortBy.value).toBe('name')
    expect(sortOrder.value).toBe('asc')

    handleSort('name')
    expect(sortOrder.value).toBe('desc')
    expect(mockRefetch).toHaveBeenCalledTimes(1)

    handleSort('price')
    expect(sortBy.value).toBe('price')
    expect(sortOrder.value).toBe('asc')
  })
})

