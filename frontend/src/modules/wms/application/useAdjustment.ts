import { ref } from 'vue'
import { adjustmentApi } from '../infrastructure/adjustment.api'
import type { Adjustment } from '../domain/adjustment.entity'
import { useToast } from '@/composables/useToast'

export function useAdjustment() {
  const adjustments = ref<Adjustment[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalItems = ref(0)
  const { toast } = useToast()

  async function fetchAdjustments(params: Record<string, any>) {
    isLoading.value = true
    try {
      const response = await adjustmentApi.fetchAdjustments(params)
      adjustments.value = response.data || []
      totalItems.value = response.meta?.total || 0
      return response
    } catch (err: any) {
      error.value = err?.message || 'Gagal mengambil data adjustment'
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
      toast('Adjustment berhasil dicatat', 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal mencatat adjustment', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function batchAdjust(payload: { items: any[], notes?: string }) {
    isLoading.value = true
    try {
      const response = await adjustmentApi.batchAdjust(payload)
      toast('Batch adjustment berhasil dicatat', 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal memproses batch adjustment', 'error')
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
