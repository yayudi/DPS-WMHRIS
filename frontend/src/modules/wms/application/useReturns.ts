import { ref } from 'vue'
import { returnApi } from '../infrastructure/return.api'
import type { ReturnData } from '../domain/return.entity'
import { useToast } from '@/composables/useToast'

export function useReturns() {
  const returns = ref<ReturnData[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalItems = ref(0)
  const { toast } = useToast()

  async function fetchReturns(params: Record<string, any>) {
    isLoading.value = true
    try {
      const response = await returnApi.fetchReturns(params)
      returns.value = response.data || []
      totalItems.value = response.meta?.total || 0
      return response
    } catch (err: any) {
      error.value = err?.message || 'Gagal mengambil data retur'
      toast(error.value || 'Error', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createReturn(payload: ReturnData) {
    isLoading.value = true
    try {
      const response = await returnApi.createReturn(payload)
      toast('Retur manual berhasil dicatat', 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal mencatat retur', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    returns,
    totalItems,
    isLoading,
    error,
    fetchReturns,
    createReturn
  }
}
