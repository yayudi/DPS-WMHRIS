import { ref } from 'vue'
import { salesChannelApi } from '../infrastructure/sales_channel.api'
import type { SalesChannel } from '../domain/sales_channel.entity'
import { useToast } from '@/composables/useToast'

export function useSalesChannels() {
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
      error.value = err?.message || 'Gagal mengambil data sales channels.'
      toast(error.value || 'Error', 'error')
    } finally {
      isLoading.value = false
    }
  }

  async function createSalesChannel(payload: any) {
    try {
      await salesChannelApi.createSalesChannel(payload)
      toast('Saluran berhasil ditambahkan.', 'success')
      await fetchSalesChannels()
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal menambahkan saluran.', 'error')
      throw err
    }
  }

  async function updateSalesChannel(id: number | string, payload: any) {
    try {
      await salesChannelApi.updateSalesChannel(id, payload)
      toast('Saluran berhasil diperbarui.', 'success')
      await fetchSalesChannels()
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal memperbarui saluran.', 'error')
      throw err
    }
  }

  async function deleteSalesChannel(id: number | string) {
    try {
      await salesChannelApi.deleteSalesChannel(id)
      toast('Saluran berhasil dihapus.', 'success')
      await fetchSalesChannels()
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Gagal menghapus saluran.', 'error')
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
