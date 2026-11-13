import { ref } from 'vue'
import { adjustmentApi } from '../infrastructure/adjustment.api'
import type { Adjustment } from '../domain/adjustment.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useAdjustment() {
  const adjustments = ref<Adjustment[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalItems = ref(0)
  const { toast } = useToast()
  const { t } = useI18n()

  async function fetchAdjustments(params: Record<string, any>) {
    isLoading.value = true
    try {
      const response = await adjustmentApi.fetchAdjustments(params)
      adjustments.value = response.data || []
      totalItems.value = response.meta?.total || 0
      return response
    } catch (err: any) {
      error.value = err?.message || t('wms.adjust.fetch_error')
      toast(error.value || 'Error', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createAdjustment(payload: Adjustment) {
    isLoading.value = true
    try {
      const response = await adjustmentApi.createAdjustment(payload)
      toast(response?.message || t('common.status.success'), 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || t('wms.adjust.save_error'), 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function batchAdjust(payload: { items: any[], notes?: string }) {
    isLoading.value = true
    try {
      const response = await adjustmentApi.batchAdjust(payload)
      toast(response?.message || t('common.status.success'), 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || t('wms.adjust.batch_error'), 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    adjustments,
    totalItems,
    isLoading,
    error,
    fetchAdjustments,
    createAdjustment,
    batchAdjust
  }
}
