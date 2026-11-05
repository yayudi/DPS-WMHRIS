import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useInlineSave } from './useInlineSave'

vi.mock('@/core/presentation/composables/useToast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

describe('useInlineSave composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tracks dirty fields and computes hasDirtyProducts', () => {
    const { dirtyProducts, hasDirtyProducts, handleInlineEditChange } = useInlineSave()

    expect(hasDirtyProducts.value).toBe(false)
    handleInlineEditChange({ id: 101, field: 'name', value: 'Updated Name' })

    expect(hasDirtyProducts.value).toBe(true)
    expect(dirtyProducts.value.get(101)).toEqual({ name: 'Updated Name' })

    handleInlineEditChange({ id: 101, field: 'price', value: 25000 })
    expect(dirtyProducts.value.get(101)).toEqual({ name: 'Updated Name', price: 25000 })
  })

  it('clears dirty state and increments tableKeyRef on cancel', () => {
    const tableKey = ref(1)
    const { dirtyProducts, hasDirtyProducts, handleInlineEditChange, handleCancelInlineEdit } =
      useInlineSave({ tableKeyRef: tableKey })

    handleInlineEditChange({ id: 101, field: 'name', value: 'Test' })
    expect(hasDirtyProducts.value).toBe(true)

    handleCancelInlineEdit()
    expect(dirtyProducts.value.size).toBe(0)
    expect(hasDirtyProducts.value).toBe(false)
    expect(tableKey.value).toBe(2)
  })

  it('uses O(1) Map lookup and calls custom saveItem and transformPayload', async () => {
    const mockSaveItem = vi.fn().mockResolvedValue({ success: true })
    const mockTransformPayload = vi.fn((orig, changes) => ({
      ...orig,
      ...changes,
      transformed: true
    }))
    const mockAfterSaveAction = vi.fn()
    const mockFetchProducts = vi.fn()

    const { handleInlineEditChange, handleBulkSaveInline, dirtyProducts } = useInlineSave({
      saveItem: mockSaveItem,
      transformPayload: mockTransformPayload,
      afterSaveAction: mockAfterSaveAction,
      fetchProducts: mockFetchProducts,
      chunkSize: 2
    })

    const sourceProducts = [
      { id: 1, name: 'Item 1', price: 100 },
      { id: 2, name: 'Item 2', price: 200 },
      { id: 3, name: 'Item 3', price: 300 }
    ]

    handleInlineEditChange({ id: 1, field: 'price', value: 150 })
    handleInlineEditChange({ id: 3, field: 'name', value: 'Item 3 New' })

    await handleBulkSaveInline(sourceProducts)

    expect(mockSaveItem).toHaveBeenCalledTimes(2)
    expect(mockTransformPayload).toHaveBeenCalledTimes(2)
    expect(mockSaveItem).toHaveBeenCalledWith(1, {
      id: 1,
      name: 'Item 1',
      price: 150,
      transformed: true
    })
    expect(mockSaveItem).toHaveBeenCalledWith(3, {
      id: 3,
      name: 'Item 3 New',
      price: 300,
      transformed: true
    })

    expect(dirtyProducts.value.size).toBe(0)
    expect(mockAfterSaveAction).toHaveBeenCalledTimes(1)
    expect(mockFetchProducts).toHaveBeenCalledTimes(1)
  })
})

