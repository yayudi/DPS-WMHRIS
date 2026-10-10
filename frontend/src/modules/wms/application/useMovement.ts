import { ref } from 'vue'
import { movementApi } from '../infrastructure/movement.api'
import type { Movement } from '../domain/movement.entity'
import { useToast } from '@/composables/useToast'

export function useMovement() {
  const movements = ref<Movement[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const totalItems = ref(0)
  const { toast } = useToast()

  async function fetchMovements(params: Record<string, any>) {
    isLoading.value = true
    try {
      const response = await movementApi.fetchMovements(params)
      movements.value = response.data || []
      totalItems.value = response.meta?.total || 0
      return response
    } catch (err: any) {
      error.value = err?.message || 'Gagal mengambil data movement'
      toast(error.value || 'Error', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchMovementById(id: number | string) {
    isLoading.value = true
    try {
      return await movementApi.fetchMovementById(id)
    } catch (err: any) {
      toast('Gagal memuat detail movement', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createMovement(payload: Movement) {
    isLoading.value = true
    try {
      const response = await movementApi.createMovement(payload)
      toast('Movement berhasil dicatat', 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal mencatat movement', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function batchMove(payload: { items: any[], notes?: string }) {
    isLoading.value = true
    try {
      const response = await movementApi.batchMove(payload)
      toast('Batch movement berhasil dicatat', 'success')
      return response
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal memproses batch movement', 'error')
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    movements,
    totalItems,
    isLoading,
    error,
    fetchMovements,
    fetchMovementById,
    createMovement,
    batchMove
  }
}
