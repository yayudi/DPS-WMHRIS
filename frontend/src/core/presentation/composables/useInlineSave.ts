import { ref, computed, type Ref } from 'vue'
import http from '@/core/infrastructure/http.client'
import { useToast } from '@/core/presentation/composables/useToast'

export interface UseInlineSaveOptions<T extends { id: string | number }> {
  saveItem?: (id: string | number, payload: any) => Promise<any>
  transformPayload?: (original: T, changes: Record<string, any>) => any
  fetchProducts?: () => void | Promise<void>
  tableKeyRef?: Ref<number>
  afterSaveAction?: () => void
  chunkSize?: number
}

export function useInlineSave<T extends { id: string | number } = any>(
  options: UseInlineSaveOptions<T> = {}
) {
  const {
    saveItem,
    transformPayload,
    fetchProducts,
    tableKeyRef,
    afterSaveAction,
    chunkSize = 10
  } = options

  const dirtyProducts = ref<Map<string | number, Record<string, any>>>(new Map())
  const isSavingInline = ref(false)
  const saveProgress = ref(0)
  const { toast } = useToast()

  const hasDirtyProducts = computed(() => dirtyProducts.value.size > 0)

  const handleInlineEditChange = ({
    id,
    field,
    value
  }: {
    id: string | number
    field: string
    value: any
  }) => {
    if (!dirtyProducts.value.has(id)) {
      dirtyProducts.value.set(id, {})
    }
    const target = dirtyProducts.value.get(id)
    if (target) {
      target[field] = value
    }
  }

  const handleCancelInlineEdit = () => {
    dirtyProducts.value.clear()
    if (tableKeyRef) {
      tableKeyRef.value++
    }
  }

  const handleBulkSaveInline = async (sourceItems: T[]) => {
    if (!hasDirtyProducts.value) return
    isSavingInline.value = true
    saveProgress.value = 0

    // O(N) indexing to allow O(1) lookups during chunk iterations
    const itemMap = new Map<string | number, T>()
    if (Array.isArray(sourceItems)) {
      for (const item of sourceItems) {
        if (item && item.id != null) {
          itemMap.set(item.id, item)
        }
      }
    }

    const entries = Array.from(dirtyProducts.value.entries())
    let successCount = 0

    const executeSave =
      saveItem ||
      ((id: string | number, payload: any) => http.put(`/products/${id}`, payload))

    try {
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize)
        const promises = chunk.map(([id, changes]) => {
          const original = itemMap.get(id) || ({ id } as T)

          const payload = transformPayload
            ? transformPayload(original, changes)
            : (() => {
                const p = { ...original, ...changes }
                if (changes.components === undefined) {
                  delete p.components
                }
                return p
              })()

          return executeSave(id, payload)
        })
        await Promise.all(promises)

        successCount += chunk.length
        saveProgress.value = Math.round((successCount / entries.length) * 100)
      }
      toast(`Berhasil menyimpan ${successCount} baris.`, 'success')
      dirtyProducts.value.clear()

      if (afterSaveAction) afterSaveAction()
      if (tableKeyRef) tableKeyRef.value++
      if (fetchProducts) fetchProducts()
    } catch (err) {
      console.error('[useInlineSave] Bulk Save Error:', err)
      toast('Gagal menyimpan beberapa perubahan', 'error')
    } finally {
      isSavingInline.value = false
    }
  }

  return {
    dirtyProducts,
    isSavingInline,
    saveProgress,
    hasDirtyProducts,
    handleInlineEditChange,
    handleCancelInlineEdit,
    handleBulkSaveInline
  }
}
