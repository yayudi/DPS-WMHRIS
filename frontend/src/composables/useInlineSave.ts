import { ref, computed } from 'vue'
import axios from '@/core/infrastructure/http.client'
import { useToast } from '@/composables/useToast'

export function useInlineSave({ fetchProducts, tableKeyRef, afterSaveAction }) {
  const dirtyProducts = ref(new Map())
  const isSavingInline = ref(false)
  const saveProgress = ref(0)
  const { toast } = useToast()

  const hasDirtyProducts = computed(() => dirtyProducts.value.size > 0)

  const handleInlineEditChange = ({ id, field, value }) => {
    if (!dirtyProducts.value.has(id)) {
      dirtyProducts.value.set(id, {})
    }
    dirtyProducts.value.get(id)[field] = value
  }

  const handleCancelInlineEdit = () => {
    dirtyProducts.value.clear()
    if (tableKeyRef) {
      tableKeyRef.value++
    }
  }

  const handleBulkSaveInline = async (productsSource) => {
    if (!hasDirtyProducts.value) return
    isSavingInline.value = true
    saveProgress.value = 0

    const entries = Array.from(dirtyProducts.value.entries())
    const CHUNK_SIZE = 10
    let successCount = 0

    try {
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE)
        const promises = chunk.map(([id, changes]) => {
          const originalProduct = productsSource.find(p => p.id === id) || {}
          const payload = { ...originalProduct, ...changes }
          
          // Jangan kirim komponen saat inline save agar tidak terhapus / kena validasi
          if (changes.components === undefined) {
            delete payload.components
          }
          
          return axios.put(`/products/${id}`, payload)
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
      console.error('Bulk Save Error:', err)
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
