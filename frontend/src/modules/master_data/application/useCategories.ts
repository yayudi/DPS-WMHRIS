import { ref } from 'vue'
import { categoryApi } from '../infrastructure/category.api'
import type { Category } from '../domain/category.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useCategories() {
  const { t } = useI18n()
  const categories = ref<Category[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const currentStatus = ref('active')
  const { toast } = useToast()

  async function fetchCategories(search: string = '', status: string = currentStatus.value) {
    currentStatus.value = status
    isLoading.value = true
    error.value = null
    try {
      const response = await categoryApi.fetchCategories(search, status)
      categories.value = response.data || response || []
    } catch (err: any) {
      error.value = err?.message || t('master_data.category.fetch_error')
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createCategory(payload: { name: string }) {
    try {
      const res = await categoryApi.createCategory(payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchCategories('', currentStatus.value)
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.category.create_error'), 'error')
      throw err
    }
  }

  async function updateCategory(id: number | string, payload: { name: string }) {
    try {
      const res = await categoryApi.updateCategory(id, payload)
      toast(res?.message || t('common.status.success'), 'success')
      // Update local state without fetching all again, or just fetch
      await fetchCategories('', currentStatus.value)
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.category.update_error'), 'error')
      throw err
    }
  }

  async function deleteCategory(id: number | string) {
    try {
      const res = await categoryApi.deleteCategory(id)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchCategories('', currentStatus.value)
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.category.delete_error'), 'error')
      throw err
    }
  }

  async function restoreCategory(id: number | string) {
    try {
      const res = await categoryApi.restoreCategory(id)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchCategories('', currentStatus.value)
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.category.update_error'), 'error')
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
    deleteCategory,
    restoreCategory
  }
}
