import { ref } from 'vue'
import { locationApi } from '../infrastructure/location.api'
import type { Location, CreateLocationPayload, UpdateLocationPayload } from '../domain/location.entity'
import { useToast } from '@/composables/useToast'

export function useLocations() {
  const locations = ref<Location[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()

  async function fetchLocations() {
    isLoading.value = true
    error.value = null
    try {
      const response = await locationApi.fetchAllLocations()
      locations.value = response.data || response || []
    } catch (err: any) {
      error.value = err?.message || 'Gagal mengambil data lokasi.'
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createLocation(payload: CreateLocationPayload) {
    isLoading.value = true
    try {
      await locationApi.createLocation(payload)
      toast('Lokasi berhasil dibuat.', 'success')
      await fetchLocations()
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal membuat lokasi.', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updateLocation(id: number | string, payload: UpdateLocationPayload) {
    isLoading.value = true
    try {
      await locationApi.updateLocation(id, payload)
      toast('Lokasi berhasil diperbarui.', 'success')
      await fetchLocations()
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal memperbarui lokasi.', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteLocation(id: number | string) {
    isLoading.value = true
    try {
      await locationApi.deleteLocation(id)
      toast('Lokasi berhasil dihapus.', 'success')
      await fetchLocations()
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal menghapus lokasi.', 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    locations,
    isLoading,
    error,
    fetchLocations,
    createLocation,
    updateLocation,
    deleteLocation
  }
}
