import { ref } from 'vue'
import { locationApi } from '../infrastructure/location.api'
import type { Location, CreateLocationPayload, UpdateLocationPayload } from '../domain/location.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useLocations() {
  const { t } = useI18n()
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
      error.value = err?.message || t('auth.profile.locations_fetch_failed')
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createLocation(payload: CreateLocationPayload) {
    isLoading.value = true
    try {
      const res = await locationApi.createLocation(payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchLocations()
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.location.create_error'), 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function updateLocation(id: number | string, payload: UpdateLocationPayload) {
    isLoading.value = true
    try {
      const res = await locationApi.updateLocation(id, payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchLocations()
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.location.update_error'), 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function deleteLocation(id: number | string) {
    isLoading.value = true
    try {
      const res = await locationApi.deleteLocation(id)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchLocations()
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.location.delete_error'), 'error')
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function toggleFulfillmentSource(id: number | string, isFulfillmentSource: boolean) {
    try {
      const res = await locationApi.toggleFulfillmentSource(id, isFulfillmentSource)
      toast(res?.message || t('common.status.success'), 'success')
      const target = locations.value.find(l => l.id === id)
      if (target) {
        target.is_fulfillment_source = isFulfillmentSource
      }
      return true
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || t('master_data.location.fulfillment_toggle_error'), 'error')
      return false
    }
  }

  return {
    locations,
    isLoading,
    error,
    fetchLocations,
    createLocation,
    updateLocation,
    deleteLocation,
    toggleFulfillmentSource
  }
}
