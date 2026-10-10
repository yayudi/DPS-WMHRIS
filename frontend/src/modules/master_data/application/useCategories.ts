import { ref } from 'vue'
import { categoryApi } from '../infrastructure/category.api'
import type { Category } from '../domain/category.entity'
import { useToast } from '@/composables/useToast'

export function useCategories() {
  const categories = ref<Category[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()

  async function fetchCategories(search: string = '') {
    isLoading.value = true
    error.value = null
    try {
      const response = await categoryApi.fetchCategories(search)
      categories.value = response.data || response || []
    } catch (err: any) {
      error.value = err?.message || 'Gagal mengambil data kategori.'
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createCategory(payload: { name: string }) {
    try {
      await categoryApi.createCategory(payload)
      toast('Kategori berhasil dibuat.', 'success')
      await fetchCategories()
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal membuat kategori.', 'error')
      throw err
    }
  }

  async function updateCategory(id: number | string, payload: { name: string }) {
    try {
      await categoryApi.updateCategory(id, payload)
      toast('Kategori berhasil diperbarui.', 'success')
      // Update local state without fetching all again, or just fetch
      await fetchCategories()
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal memperbarui kategori.', 'error')
      throw err
    }
  }

  async function deleteCategory(id: number | string) {
    try {
      await categoryApi.deleteCategory(id)
      toast('Kategori berhasil dihapus.', 'success')
      await fetchCategories()
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal menghapus kategori.', 'error')
      throw err
    }
  }

  return {
    categories,
    isLoading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory
  }
}
