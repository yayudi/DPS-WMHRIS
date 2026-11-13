import { ref } from 'vue'
import { salesChannelApi } from '../infrastructure/sales_channel.api'
import type { SalesChannel } from '../domain/sales_channel.entity'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'

export function useSalesChannels() {
  const { t } = useI18n()
  const salesChannels = ref<SalesChannel[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const { toast } = useToast()

  async function fetchSalesChannels() {
    isLoading.value = true
    error.value = null
    try {
      const response = await salesChannelApi.fetchAllSalesChannels()
      salesChannels.value = response.data || response || []
    } catch (err: any) {
      error.value = err?.message || t('master_data.channel.fetch_error')
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createSalesChannel(payload: any) {
    try {
      const res = await salesChannelApi.createSalesChannel(payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchSalesChannels()
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.channel.create_error'), 'error')
      throw err
    }
  }

  async function updateSalesChannel(id: number | string, payload: any) {
    try {
      const res = await salesChannelApi.updateSalesChannel(id, payload)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchSalesChannels()
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.channel.update_error'), 'error')
      throw err
    }
  }

  async function deleteSalesChannel(id: number | string) {
    try {
      const res = await salesChannelApi.deleteSalesChannel(id)
      toast(res?.message || t('common.status.success'), 'success')
      await fetchSalesChannels()
    } catch (err: any) {
      toast(err?.response?.data?.message || t('master_data.channel.delete_error'), 'error')
      throw err
    }
  }

  return {
    salesChannels,
    isLoading,
    error,
    fetchSalesChannels,
    createSalesChannel,
    updateSalesChannel,
    deleteSalesChannel
  }
}
